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
  healthy = true;
  healthCalls = 0;
  /** When set, health() waits on this before resolving (to overlap passes). */
  healthGate?: Promise<void>;

  /** When set, uploadFile waits on this before resolving (to overlap passes). */
  uploadGate?: Promise<void>;

  async uploadFile(params: UploadFileParams): Promise<void> {
    if (this.uploadGate !== undefined) {
      await this.uploadGate;
    }
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
    this.healthCalls += 1;
    if (this.healthGate !== undefined) {
      await this.healthGate;
    }
    return this.healthy;
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

describe('HttpUploadService bails out early when the receiver is down', () => {
  it('stops after the FIRST failed upload (no fetch pre-gate), leaving the rest queued', async () => {
    const { svc, idx, transport } = harness(ENABLED);
    transport.failUpload = true; // receiver unreachable: real uploads fail
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    await svc.enqueue(item('caseX/video_001.mp4', 'video_001.mp4'));

    await svc.processQueue();

    // Only the first item was attempted; the pass bailed, rest still pending.
    expect(transport.uploads).toHaveLength(0);
    expect(idx.getQueue()[0]?.status).toBe('error');
    expect(idx.getQueue()[1]?.status).toBe('pending');

    // Receiver back: the same queue drains fully on the next send.
    transport.failUpload = false;
    await svc.processQueue();
    expect(transport.uploads).toHaveLength(2);
    expect(idx.getQueue().every(i => i.status === 'uploaded')).toBe(true);
  });

  it('does no upload work when the queue is empty', async () => {
    const { svc, transport } = harness(ENABLED);
    await svc.processQueue();
    expect(transport.uploads).toHaveLength(0);
  });

  it('keeps going past a LATER transient failure once something got through', async () => {
    const { svc, idx, transport } = harness(ENABLED);
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    await svc.enqueue(item('caseX/photo_002.jpg', 'photo_002.jpg'));
    // First succeeds; make the SECOND fail to prove we don't bail after success.
    const realUpload = transport.uploadFile.bind(transport);
    let n = 0;
    transport.uploadFile = async p => {
      n += 1;
      if (n === 2) {
        throw new Error('transient');
      }
      return realUpload(p);
    };

    await svc.processQueue();
    expect(idx.getQueue()[0]?.status).toBe('uploaded');
    expect(idx.getQueue()[1]?.status).toBe('error'); // attempted, not skipped
  });

  it('never runs two passes concurrently (bursty NetInfo events)', async () => {
    const { svc, transport } = harness(ENABLED);
    await svc.enqueue(item('caseX/photo_001.jpg', 'photo_001.jpg'));
    // Hold the first pass inside uploadFile so a second trigger overlaps it.
    let release = (): void => {};
    transport.uploadGate = new Promise<void>(r => {
      release = r;
    });

    const first = svc.processQueue();
    const second = svc.processQueue(); // must early-return (running guard)
    release();
    await Promise.all([first, second]);

    // The guard prevented a second concurrent pass: only one upload happened.
    expect(transport.uploads).toHaveLength(1);
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
