import { MmkvStorageIndex } from './storageIndex';
import type { UploadQueueItem } from '../../types';

function item(filePath: string): UploadQueueItem {
  return {
    filePath,
    plateNumber: '123-45-678',
    fileName: filePath.split('/').pop() ?? '',
    status: 'pending',
    attempts: 0,
    enqueuedAt: '2026-05-25T09:14:00.000Z',
  };
}

describe('MmkvStorageIndex', () => {
  it('persists and reads open sessions', () => {
    const idx = new MmkvStorageIndex();
    idx.clear();
    idx.setOpenSessions([
      {
        case_id: '123-45-678_20260525-091400_abc',
        plate_number: '123-45-678',
        session_start: '2026-05-25T09:14:00.000Z',
        file_count: 3,
      },
    ]);
    expect(idx.getOpenSessions()).toHaveLength(1);
    expect(idx.getOpenSessions()[0]?.plate_number).toBe('123-45-678');
  });

  it('enqueues idempotently and updates status', () => {
    const idx = new MmkvStorageIndex();
    idx.clear();
    idx.enqueueUpload(item('/a/photo_001.jpg'));
    idx.enqueueUpload(item('/a/photo_001.jpg')); // дубликат игнорируется
    expect(idx.getQueue()).toHaveLength(1);

    idx.updateUploadStatus('/a/photo_001.jpg', 'uploaded');
    expect(idx.getQueue()[0]?.status).toBe('uploaded');

    idx.removeFromQueue('/a/photo_001.jpg');
    expect(idx.getQueue()).toHaveLength(0);
  });
});

describe('MmkvStorageIndex.renameCasePrefix', () => {
  it('repoints queued filePaths and resets their status to pending', () => {
    const idx = new MmkvStorageIndex();
    idx.clear();
    const base = {
      plateNumber: '123-45-678',
      status: 'uploaded' as const,
      attempts: 0,
      enqueuedAt: '2026-05-25T09:14:00.000Z',
    };
    idx.enqueueUpload({ ...base, filePath: 'A_B_20260525/plate.jpg', fileName: 'plate.jpg' });
    idx.enqueueUpload({ ...base, filePath: 'OTHER/photo.jpg', fileName: 'photo.jpg' });

    idx.renameCasePrefix('A_B_20260525', 'A_B_20260525_w');

    const q = idx.getQueue();
    expect(q.find(i => i.fileName === 'plate.jpg')?.filePath).toBe('A_B_20260525_w/plate.jpg');
    expect(q.find(i => i.fileName === 'plate.jpg')?.status).toBe('pending');
    // Unrelated entries are untouched.
    expect(q.find(i => i.fileName === 'photo.jpg')?.filePath).toBe('OTHER/photo.jpg');
    expect(q.find(i => i.fileName === 'photo.jpg')?.status).toBe('uploaded');
  });
});
