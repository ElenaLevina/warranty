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
    orderNumber: '113188',
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
    // Open case_id = <plate>_<order>_<YYYYMMDD> (letter added at finish).
    expect(meta.order_number).toBe('113188');
    expect(meta.case_id).toMatch(new RegExp(`^${PLATE}_113188_\\d{8}$`));
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
      orderNumber: '113188',
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
      orderNumber: '220011',
      mechanicId: 'user_aaa',
      plateImageTmpPath: '/tmp/plateA.jpg',
    });
    await svc.createCase({
      plateNumber: '22-222-22',
      orderNumber: '220022',
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
      orderNumber: '220033',
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

describe('FilesService.replacePhoto (green-pencil markup)', () => {
  it('replaces the photo bytes in place and bumps the entry timestamp', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');

    await fs.writeFile('/tmp/marked.jpg', 'MARKED_IMG');
    const updated = await svc.replacePhoto(meta.case_id, 'photo_001.jpg', '/tmp/marked.jpg');

    // Same file name, new content, no extra entries.
    expect(await fs.readFile(`${ROOT}/${meta.case_id}/photo_001.jpg`)).toBe('MARKED_IMG');
    expect(updated.files.filter(f => f.name === 'photo_001.jpg')).toHaveLength(1);
    expect(updated.files).toHaveLength(2); // plate.jpg + photo_001.jpg
  });

  it('rejects replacing a missing file or a video', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addVideo(meta.case_id, '/tmp/clip.mp4', 10);
    await fs.writeFile('/tmp/marked.jpg', 'MARKED_IMG');

    await expect(svc.replacePhoto(meta.case_id, 'photo_009.jpg', '/tmp/marked.jpg')).rejects.toThrow();
    await expect(svc.replacePhoto(meta.case_id, 'video_001.mp4', '/tmp/marked.jpg')).rejects.toThrow();
  });

  it('is blocked on a closed case (READ ONLY + tamper.log)', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');
    await svc.closeCase(meta.case_id);

    await fs.writeFile('/tmp/marked.jpg', 'MARKED_IMG');
    await expect(
      svc.replacePhoto(meta.case_id, 'photo_001.jpg', '/tmp/marked.jpg'),
    ).rejects.toBeInstanceOf(SessionClosedError);
    // Original bytes untouched, attempt logged.
    expect(await fs.readFile(`${ROOT}/${meta.case_id}/photo_001.jpg`)).toBe('PHOTO_IMG');
    expect(await fs.readFile(`${ROOT}/tamper.log`)).toContain('replacePhoto');
  });
});

describe('FilesService.deleteFile', () => {
  it('removes the file from disk and from session.json (open case)', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');

    const updated = await svc.deleteFile(meta.case_id, 'photo_001.jpg');

    expect(await fs.exists(`${ROOT}/${meta.case_id}/photo_001.jpg`)).toBe(false);
    expect(updated.files.some(f => f.name === 'photo_001.jpg')).toBe(false);
    // The other photo and the plate stay.
    expect(await fs.exists(`${ROOT}/${meta.case_id}/photo_002.jpg`)).toBe(true);
    expect(updated.files.map(f => f.name)).toEqual(['plate.jpg', 'photo_002.jpg']);
  });

  it('never deletes the plate photo', async () => {
    const { svc } = await setup();
    const meta = await createOpenCase(svc);
    await expect(svc.deleteFile(meta.case_id, 'plate.jpg')).rejects.toThrow();
  });

  it('rejects deleting a missing file', async () => {
    const { svc } = await setup();
    const meta = await createOpenCase(svc);
    await expect(svc.deleteFile(meta.case_id, 'photo_009.jpg')).rejects.toThrow();
  });

  it('is blocked on a closed case (READ ONLY + tamper.log)', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');
    await svc.closeCase(meta.case_id);

    await expect(svc.deleteFile(meta.case_id, 'photo_001.jpg')).rejects.toBeInstanceOf(
      SessionClosedError,
    );
    expect(await fs.exists(`${ROOT}/${meta.case_id}/photo_001.jpg`)).toBe(true);
    expect(await fs.readFile(`${ROOT}/tamper.log`)).toContain('deleteFile');
  });
});

describe('FilesService resilience to an unreadable case', () => {
  /** Create a second case and corrupt its session.json. Returns both ids. */
  async function goodAndCorrupt(ctx: Ctx): Promise<{ good: string; bad: string }> {
    const good = await createOpenCase(ctx.svc);
    await ctx.fs.writeFile('/tmp/plate2.jpg', 'PLATE_IMG_2');
    const bad = await ctx.svc.createCase({
      plateNumber: '22-222-22',
      orderNumber: '113200',
      mechanicId: 'user_042',
      plateImageTmpPath: '/tmp/plate2.jpg',
    });
    // Truncated / undecryptable session.json (killed mid-write, wrong key…).
    await ctx.fs.writeFile(`${ROOT}/${bad.case_id}/session.json`, '{ not valid json');
    return { good: good.case_id, bad: bad.case_id };
  }

  it('still lists the healthy open sessions (one bad case must not hide all)', async () => {
    const ctx = await setup();
    const { good, bad } = await goodAndCorrupt(ctx);

    const open = await ctx.svc.listOpenSessions();
    expect(open.map(s => s.case_id)).toEqual([good]);
    expect(open.map(s => s.case_id)).not.toContain(bad);
  });

  it('still lists the healthy cases in the recovery list', async () => {
    const ctx = await setup();
    const { good, bad } = await goodAndCorrupt(ctx);

    const all = await ctx.svc.listAllCases();
    expect(all.map(c => c.case_id)).toEqual([good]);
    expect(all.map(c => c.case_id)).not.toContain(bad);
  });
});

describe('FilesService recommendation (המלצה)', () => {
  it('materializes recommendation.txt with the fixed text when the flag is on', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.setRecommendation(meta.case_id, true);
    await svc.setOrderType(meta.case_id, 'warranty');
    const closed = await svc.closeCase(meta.case_id);

    expect(await fs.exists(`${ROOT}/${closed.case_id}/recommendation.txt`)).toBe(true);
    expect(await fs.readFile(`${ROOT}/${closed.case_id}/recommendation.txt`)).toBe(
      'Path to check card number:',
    );
    // Not a media file: never added to files[].
    expect(closed.files.some(f => f.name === 'recommendation.txt')).toBe(false);
  });

  it('creates no file when the flag is off (the default)', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.setOrderType(meta.case_id, 'recall');
    const closed = await svc.closeCase(meta.case_id);

    expect(closed.recommendation).toBeUndefined();
    expect(await fs.exists(`${ROOT}/${closed.case_id}/recommendation.txt`)).toBe(false);
  });

  it('creates no file when the flag was ticked and then unticked', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.setRecommendation(meta.case_id, true);
    await svc.setRecommendation(meta.case_id, false);
    await svc.setOrderType(meta.case_id, 'warranty');
    const closed = await svc.closeCase(meta.case_id);

    expect(await fs.exists(`${ROOT}/${closed.case_id}/recommendation.txt`)).toBe(false);
  });

  it('rejects setRecommendation on a closed case', async () => {
    const { svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.setOrderType(meta.case_id, 'warranty');
    const closed = await svc.closeCase(meta.case_id);
    await expect(svc.setRecommendation(closed.case_id, true)).rejects.toBeInstanceOf(
      SessionClosedError,
    );
  });
});

describe('FilesService.setOrderType + folder rename on close', () => {
  it('renames the folder to <base>_w on close for a warranty card', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.addPhoto(meta.case_id, '/tmp/shot.jpg');

    await svc.setOrderType(meta.case_id, 'warranty');
    const closed = await svc.closeCase(meta.case_id);

    expect(closed.case_id).toBe(`${meta.case_id}_w`);
    expect(closed.order_type).toBe('warranty');
    // files moved to the new folder; the old folder no longer holds them
    expect(await fs.exists(`${ROOT}/${closed.case_id}/plate.jpg`)).toBe(true);
    expect(await fs.exists(`${ROOT}/${closed.case_id}/photo_001.jpg`)).toBe(true);
    expect(await fs.exists(`${ROOT}/${closed.case_id}/session.json`)).toBe(true);
    expect(await fs.exists(`${ROOT}/${meta.case_id}/plate.jpg`)).toBe(false);
    // session.json is readable under the final id and marked closed
    expect((await svc.readSession(closed.case_id)).status).toBe('closed');
  });

  it('uses _r for a recall card', async () => {
    const { svc } = await setup();
    const meta = await createOpenCase(svc);
    await svc.setOrderType(meta.case_id, 'recall');
    const closed = await svc.closeCase(meta.case_id);
    expect(closed.case_id).toBe(`${meta.case_id}_r`);
  });

  it('gives a -2 base for a same-day repeat of the same plate+order', async () => {
    const { svc } = await setup();
    const a = await createOpenCase(svc);
    const b = await createOpenCase(svc);
    expect(b.case_id).toBe(`${a.case_id}-2`);

    // Even after the first case is closed+renamed, the base stays reserved.
    await svc.setOrderType(a.case_id, 'warranty');
    await svc.closeCase(a.case_id);
    const c = await createOpenCase(svc);
    expect(c.case_id).toBe(`${a.case_id}-3`);
  });
});
