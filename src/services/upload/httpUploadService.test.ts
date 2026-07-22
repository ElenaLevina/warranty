import { HttpUploadService } from './httpUploadService';
import { InMemoryFileSystem } from '../files/inMemoryFileSystem';
import { PassthroughCryptoService } from '../crypto/cryptoService';
import { MmkvStorageIndex } from '../storage/storageIndex';
import type { UploadConfig, UploadSettings } from './uploadConfig';
import type { CompleteParams, UploadFileParams, UploadTransport } from './uploadTransport';
import type { UploadQueueItem, UploadStatus } from '../../types';

function fakeConfig(initial: UploadSettings): UploadConfig {
  let cur = initial;
  return {
    get: () => cur,
    set: patch => {
      cur = { ...cur, ...patch };
    },
  };
}

class FakeTransport implements UploadTransport {
  uploads: UploadFileParams[] = [];
  completes: CompleteParams[] = [];
  failUpload = false;
  failComplete = false;

  async uploadFile(params: UploadFileParams): Promise<void> {
    if (this.failUpload) {
      throw new Error('network down');
    }
    this.uploads.push(params);
  }
  async complete(params: CompleteParams): Promise<void> {
    if (this.failComplete) {
      throw new Error('network down');
    }
    this.completes.push(params);
  }
  async health(): Promise<boolean> {
    return true;
  }
}

function item(filePath: string, fileName: string): UploadQueueItem {
  return {
    filePath,
    plateNumber: '123-45-678',
    fileName,
    status: 'pending',
    attempts: 0,
    enqueuedAt: '2026-05-25T09:14:00.000Z',
  };
}

interface H {
  svc: HttpUploadService;
  idx: MmkvStorageIndex;
  transport: FakeTransport;
  statuses: Array<[string, UploadStatus]>;
}

function harness(settings: UploadSettings): H {
  const idx = new MmkvStorageIndex();
  idx.clear();
  const fs = new InMemoryFileSystem();
  const transport = new FakeTransport();
  const statuses: Array<[string, UploadStatus]> = [];
  const svc = new HttpUploadService({
    config: fakeConfig(settings),
    index: idx,
    crypto: new PassthroughCryptoService(fs),
    fs,
    transport,
    casesRoot: '/data/cases',
    onStatus: (f, s) => statuses.push([f, s]),
  });
  return { svc, idx, transport, statuses };
}

const ENABLED: UploadSettings = { enabled: true, baseUrl: 'http://pc:8080', token: 't' };

describe('HttpUploadService', () => {
  it('queues on enqueue (no upload) and uploads via processQueue', async () => {
    const { svc, idx, transport, statuses } = harness(ENABLED);
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));

    // enqueue does NOT upload (per-file upload is off; sent on finish/processQueue)
    expect(transport.uploads).toHaveLength(0);
    expect(idx.getQueue()[0]?.status).toBe('pending');

    await svc.processQueue();
    expect(transport.uploads).toHaveLength(1);
    expect(transport.uploads[0]?.caseId).toBe('caseX');
    expect(transport.uploads[0]?.type).toBe('photo');
    expect(idx.getQueue()[0]?.status).toBe('uploaded');
    expect(statuses).toContainEqual(['photo_001.jpg', 'uploaded']);
  });

  it('detects video by extension', async () => {
    const { svc, transport } = harness(ENABLED);
    await svc.enqueue(item('caseX/video_001.mp4', 'video_001.mp4'));
    await svc.processQueue();
    expect(transport.uploads[0]?.type).toBe('video');
  });

  it('leaves items pending when upload is disabled (offline/not configured)', async () => {
    const { svc, idx, transport } = harness({ enabled: false, baseUrl: '', token: '' });
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    await svc.processQueue();
    expect(transport.uploads).toHaveLength(0);
    expect(idx.getQueue()[0]?.status).toBe('pending');
  });

  it('marks error on failure and retries via processQueue', async () => {
    const { svc, idx, transport } = harness(ENABLED);
    transport.failUpload = true;
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    await svc.processQueue();
    expect(idx.getQueue()[0]?.status).toBe('error');

    // network back: processQueue re-sends everything not uploaded
    transport.failUpload = false;
    await svc.processQueue();
    expect(idx.getQueue()[0]?.status).toBe('uploaded');
    expect(transport.uploads).toHaveLength(1);
  });

  it('completeCase posts session.json only when enabled', async () => {
    const { svc, transport } = harness(ENABLED);
    await svc.completeCase('caseX', '{"status":"closed"}');
    expect(transport.completes).toHaveLength(1);
    expect(transport.completes[0]?.caseId).toBe('caseX');

    const off = harness({ enabled: false, baseUrl: '', token: '' });
    await off.svc.completeCase('caseX', '{}');
    expect(off.transport.completes).toHaveLength(0);
  });
});

describe('HttpUploadService device tag (no cross-phone overwrite)', () => {
  it('suffixes the receiver caseId with the device tag for files and complete', async () => {
    const idx = new MmkvStorageIndex();
    idx.clear();
    const fs = new InMemoryFileSystem();
    const transport = new FakeTransport();
    const svc = new HttpUploadService({
      config: fakeConfig(ENABLED),
      index: idx,
      crypto: new PassthroughCryptoService(fs),
      fs,
      transport,
      casesRoot: '/data/cases',
      deviceTag: 'A3F9',
    });
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    await svc.processQueue();
    expect(transport.uploads[0]?.caseId).toBe('caseX__A3F9');

    await svc.completeCase('caseX', '{}');
    expect(transport.completes[0]?.caseId).toBe('caseX__A3F9');
  });
});

describe('HttpUploadService session.json retry (field-testing bug)', () => {
  it('keeps session.json pending when the PC is unreachable and retries it in processQueue', async () => {
    const { svc, idx, transport } = harness(ENABLED);

    // Finish while the receiver is down: complete fails but is remembered.
    transport.failComplete = true;
    await svc.completeCase('caseX', '{"status":"closed"}');
    expect(transport.completes).toHaveLength(0);
    expect(idx.getPendingCompletes()).toEqual([
      { caseId: 'caseX', sessionJson: '{"status":"closed"}' },
    ]);

    // Receiver back: the regular queue retry also flushes pending completes.
    transport.failComplete = false;
    await svc.processQueue();
    expect(transport.completes).toHaveLength(1);
    expect(idx.getPendingCompletes()).toEqual([]);
  });

  it('clears the pending marker on immediate success', async () => {
    const { svc, idx } = harness(ENABLED);
    await svc.completeCase('caseX', '{}');
    expect(idx.getPendingCompletes()).toEqual([]);
  });

  it('keeps the marker while upload is disabled (sent after it is enabled)', async () => {
    const { svc, idx, transport } = harness({ enabled: false, baseUrl: '', token: '' });
    await svc.completeCase('caseX', '{}');
    expect(idx.getPendingCompletes()).toHaveLength(1);
    expect(transport.completes).toHaveLength(0);
  });
});
