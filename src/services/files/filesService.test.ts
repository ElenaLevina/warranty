import { InMemoryFileSystem } from './inMemoryFileSystem';
import { PassthroughCryptoService } from '../crypto/cryptoService';
import { FilesService } from './filesService';
import { SessionClosedError } from './errors';
import type { SessionMeta } from '../../types';

const ROOT = '/data/cases';
const PLATE = '123-45-678';

function makeClock(): () => Date {
  // Monotonic 1s ticks from a fixed point for determinism.
  let t = Date.parse('2026-05-25T09:14:00.000Z');
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

interface Ctx {
  fs: InMemoryFileSystem;
  svc: FilesService;
}

async function setup(): Promise<Ctx> {
  const fs = new InMemoryFileSystem();
  const crypto = new PassthroughCryptoService(fs);
  const svc = new FilesService(fs, crypto, ROOT, makeClock());
  await fs.writeFile('/tmp/plate.jpg', 'PLATE_IMG');
  await fs.writeFile('/tmp/shot.jpg', 'PHOTO_IMG');
  await fs.writeFile('/tmp/clip.mp4', 'VIDEO_BIN');
  return { fs, svc };
}

async function createOpenCase(svc: FilesService): Promise<SessionMeta> {
  return svc.createCase({
    plateNumber: PLATE,
    mechanicId: 'user_042',
    plateImageTmpPath: '/tmp/plate.jpg',
  });
}

describe('FilesService.createCase', () => {
  it('creates a dated case folder, plate.jpg and an open session.json', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);

    expect(meta.status).toBe('open');
    expect(meta.session_end).toBeNull();
    expect(meta.plate_number).toBe(PLATE);
    // case_id starts with the plate and is the folder name.
    expect(meta.case_id.startsWith(`${PLATE}_`)).toBe(true);
    expect(meta.files).toEqual([{ name: 'plate.jpg', type: 'photo', timestamp: '09:14:02' }]);
    expect(await fs.exists(`${ROOT}/${meta.case_id}/plate.jpg`)).toBe(true);
    expect(await fs.exists(`${ROOT}/${meta.case_id}/session.json`)).toBe(true);
  });

  it('creates a SEPARATE case for every scan of the same plate', async () => {
    const { svc } = await setup();
    const a = await createOpenCase(svc);
    const b = await createOpenCase(svc);
    expect(a.case_id).not.toBe(b.case_id);
    expect(a.plate_number).toBe(b.plate_number);
  });

  it('allows a new case for a plate even after a previous case is closed (bug fix)', async () => {
    const { svc } = await setup();
    const first = await createOpenCase(svc);
    await svc.closeCase(first.case_id);
    // Must NOT throw — scanning the same car again opens a fresh case.
    const second = await createOpenCase(svc);
    expect(second.status).toBe('open');
    expect(second.case_id).not.toBe(first.case_id);
  });

  it('writes device_id into session.json when provided', async () => {
    const { svc } = await setup();
    const meta = await svc.createCase({
      plateNumber: PLATE,
      mechanicId: 'user_042',
      deviceId: 'dev_abc123abc123',
      plateImageTmpPath: '/tmp/plate.jpg',
    });
    expect((await svc.readSession(meta.case_id)).device_id).toBe('dev_abc123abc123');
  });

  it('omits device_id when not provided', async () => {
    const { svc } = await setup();
    const meta = await createOpenCase(svc);
    expect((await svc.readSession(meta.case_id)).device_id).toBeUndefined();
  });
});

describe('FilesService numbering', () => {
  it('numbers photos sequentially with zero-padding', async () => {
    const { svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    const a = await svc.addPhoto(case_id, '/tmp/shot.jpg');
    const b = await svc.addPhoto(case_id, '/tmp/shot.jpg');
    expect(a.name).toBe('photo_001.jpg');
    expect(b.name).toBe('photo_002.jpg');
  });

  it('keeps photo and video counters independent', async () => {
    const { svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    await svc.addPhoto(case_id, '/tmp/shot.jpg');
    const v1 = await svc.addVideo(case_id, '/tmp/clip.mp4', 34);
    await svc.addPhoto(case_id, '/tmp/shot.jpg');
    const v2 = await svc.addVideo(case_id, '/tmp/clip.mp4', 12);
    expect(v1.name).toBe('video_001.mp4');
    expect(v2.name).toBe('video_002.mp4');
    const meta = await svc.readSession(case_id);
    const photos = meta.files.filter(f => f.type === 'photo').map(f => f.name);
    expect(photos).toEqual(['plate.jpg', 'photo_001.jpg', 'photo_002.jpg']);
  });

  it('records video duration and rejects videos over the max length', async () => {
    const { svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    const v = await svc.addVideo(case_id, '/tmp/clip.mp4', 34);
    expect(v.duration_sec).toBe(34);
    await expect(svc.addVideo(case_id, '/tmp/clip.mp4', 181)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('FilesService.closeCase + READ ONLY invariant', () => {
  it('closes the case, stamps session_end and makes files read-only', async () => {
    const { fs, svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    await svc.addPhoto(case_id, '/tmp/shot.jpg');
    const closed = await svc.closeCase(case_id);

    expect(closed.status).toBe('closed');
    expect(closed.session_end).not.toBeNull();
    expect(fs.getMode(`${ROOT}/${case_id}/plate.jpg`)).toBe(0o444);
    expect(fs.getMode(`${ROOT}/${case_id}/photo_001.jpg`)).toBe(0o444);
  });

  it('rejects every write to a closed case and logs the attempt to tamper.log', async () => {
    const { fs, svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    await svc.closeCase(case_id);

    await expect(svc.addPhoto(case_id, '/tmp/shot.jpg')).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.addVideo(case_id, '/tmp/clip.mp4', 5)).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.setDescription(case_id, 'x')).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.closeCase(case_id)).rejects.toBeInstanceOf(SessionClosedError);

    const log = await fs.readFile(`${ROOT}/tamper.log`);
    expect(log.trim().split('\n')).toHaveLength(4);
    expect(log).toContain('addPhoto');
    expect(log).toContain(case_id);
    expect(log).toContain('attempt to modify closed case');
  });
});

describe('FilesService.setDescription + listOpenSessions', () => {
  it('stores description on the open case', async () => {
    const { svc } = await setup();
    const { case_id } = await createOpenCase(svc);
    await svc.setDescription(case_id, 'Трещина в блоке цилиндров.');
    expect((await svc.readSession(case_id)).description).toBe('Трещина в блоке цилиндров.');
  });

  it('isolates open sessions by mechanic_id', async () => {
    const { fs, svc } = await setup();
    await fs.writeFile('/tmp/plateA.jpg', 'A');
    await fs.writeFile('/tmp/plateB.jpg', 'B');
    await svc.createCase({
      plateNumber: '111-11-111',
      mechanicId: 'user_aaa',
      plateImageTmpPath: '/tmp/plateA.jpg',
    });
    await svc.createCase({
      plateNumber: '22-222-22',
      mechanicId: 'user_bbb',
      plateImageTmpPath: '/tmp/plateB.jpg',
    });

    const forA = await svc.listOpenSessions('user_aaa');
    expect(forA.map(s => s.plate_number)).toEqual(['111-11-111']);
    expect(await svc.listOpenSessions()).toHaveLength(2);
  });

  it('lists only open sessions, returning case_id + plate', async () => {
    const { fs, svc } = await setup();
    const open1 = await createOpenCase(svc);
    await fs.writeFile('/tmp/plate2.jpg', 'IMG2');
    const toClose = await svc.createCase({
      plateNumber: '12-345-67',
      mechanicId: 'user_042',
      plateImageTmpPath: '/tmp/plate2.jpg',
    });
    await svc.closeCase(toClose.case_id);

    const open = await svc.listOpenSessions();
    expect(open.map(s => s.case_id)).toEqual([open1.case_id]);
    expect(open[0]?.plate_number).toBe(PLATE);
    expect(open[0]?.file_count).toBe(1);
  });
});
