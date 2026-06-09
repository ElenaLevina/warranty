import { InMemoryFileSystem } from './inMemoryFileSystem';
import { PassthroughCryptoService } from '../crypto/cryptoService';
import { FilesService } from './filesService';
import { CaseAlreadyClosedError, SessionClosedError } from './errors';
import type { SessionMeta } from '../../types';

const ROOT = '/data/cases';
const PLATE = '123-45-678';

function makeClock(): () => Date {
  // Монотонные «тики» по 1с от фиксированной точки для детерминизма.
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
  // временные кадры камеры
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
  it('creates case dir, plate.jpg and an open session.json', async () => {
    const { fs, svc } = await setup();
    const meta = await createOpenCase(svc);

    expect(meta.status).toBe('open');
    expect(meta.session_end).toBeNull();
    expect(meta.plate_number).toBe(PLATE);
    expect(meta.files).toEqual([
      { name: 'plate.jpg', type: 'photo', timestamp: '09:14:01' },
    ]);
    expect(await fs.exists(`${ROOT}/${PLATE}/plate.jpg`)).toBe(true);
    expect(await fs.exists(`${ROOT}/${PLATE}/session.json`)).toBe(true);
  });

  it('returns the existing open session when called again (return to active session)', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    const again = await createOpenCase(svc);
    expect(again.files).toHaveLength(1); // не пересоздаёт
  });

  it('refuses to reopen a closed case', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    await svc.closeCase(PLATE);
    await expect(createOpenCase(svc)).rejects.toBeInstanceOf(CaseAlreadyClosedError);
  });
});

describe('FilesService numbering', () => {
  it('numbers photos sequentially with zero-padding', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    const a = await svc.addPhoto(PLATE, '/tmp/shot.jpg');
    const b = await svc.addPhoto(PLATE, '/tmp/shot.jpg');
    expect(a.name).toBe('photo_001.jpg');
    expect(b.name).toBe('photo_002.jpg');
  });

  it('keeps photo and video counters independent', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    await svc.addPhoto(PLATE, '/tmp/shot.jpg');
    const v1 = await svc.addVideo(PLATE, '/tmp/clip.mp4', 34);
    await svc.addPhoto(PLATE, '/tmp/shot.jpg');
    const v2 = await svc.addVideo(PLATE, '/tmp/clip.mp4', 12);
    expect(v1.name).toBe('video_001.mp4');
    expect(v2.name).toBe('video_002.mp4');
    const meta = await svc.readSession(PLATE);
    const photos = meta.files.filter(f => f.type === 'photo').map(f => f.name);
    expect(photos).toEqual(['plate.jpg', 'photo_001.jpg', 'photo_002.jpg']);
  });

  it('records video duration and rejects videos over the max length', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    const v = await svc.addVideo(PLATE, '/tmp/clip.mp4', 34);
    expect(v.duration_sec).toBe(34);
    await expect(svc.addVideo(PLATE, '/tmp/clip.mp4', 181)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('FilesService.closeCase + READ ONLY invariant', () => {
  it('closes the case, stamps session_end and makes files read-only', async () => {
    const { fs, svc } = await setup();
    await createOpenCase(svc);
    await svc.addPhoto(PLATE, '/tmp/shot.jpg');
    const closed = await svc.closeCase(PLATE);

    expect(closed.status).toBe('closed');
    expect(closed.session_end).not.toBeNull();
    expect(fs.getMode(`${ROOT}/${PLATE}/plate.jpg`)).toBe(0o444);
    expect(fs.getMode(`${ROOT}/${PLATE}/photo_001.jpg`)).toBe(0o444);
  });

  it('rejects every write to a closed case and logs the attempt to tamper.log', async () => {
    const { fs, svc } = await setup();
    await createOpenCase(svc);
    await svc.closeCase(PLATE);

    await expect(svc.addPhoto(PLATE, '/tmp/shot.jpg')).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.addVideo(PLATE, '/tmp/clip.mp4', 5)).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.setDescription(PLATE, 'x')).rejects.toBeInstanceOf(SessionClosedError);
    await expect(svc.closeCase(PLATE)).rejects.toBeInstanceOf(SessionClosedError);

    const log = await fs.readFile(`${ROOT}/tamper.log`);
    const lines = log.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(log).toContain('addPhoto');
    expect(log).toContain('attempt to modify closed case');
  });
});

describe('FilesService.setDescription + listOpenSessions', () => {
  it('stores description on the open case', async () => {
    const { svc } = await setup();
    await createOpenCase(svc);
    await svc.setDescription(PLATE, 'Трещина в блоке цилиндров.');
    const meta = await svc.readSession(PLATE);
    expect(meta.description).toBe('Трещина в блоке цилиндров.');
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

    const all = await svc.listOpenSessions();
    expect(all).toHaveLength(2);
  });

  it('lists only open sessions', async () => {
    const { fs, svc } = await setup();
    await createOpenCase(svc);
    // второй кейс, который закроем
    await fs.writeFile('/tmp/plate2.jpg', 'IMG2');
    await svc.createCase({
      plateNumber: '12-345-67',
      mechanicId: 'user_042',
      plateImageTmpPath: '/tmp/plate2.jpg',
    });
    await svc.closeCase('12-345-67');

    const open = await svc.listOpenSessions();
    expect(open.map(s => s.plate_number)).toEqual([PLATE]);
    expect(open[0]?.file_count).toBe(1);
  });
});
