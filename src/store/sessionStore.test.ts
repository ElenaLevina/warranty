import { createSessionStore } from './sessionStore';
import { createTestServices } from '../services/container';
import type { NotifyEvent } from '../services/notify/notifyService';
import type { OcrResult } from '../types';

function fixedClock(): () => Date {
  let t = Date.parse('2026-05-25T09:14:00.000Z');
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

interface Harness {
  store: ReturnType<typeof createSessionStore>;
  services: ReturnType<typeof createTestServices>;
  events: NotifyEvent[];
}

function harness(ocrScript: OcrResult): Harness {
  const events: NotifyEvent[] = [];
  const services = createTestServices({
    ocrScript,
    now: fixedClock(),
    notifySink: (_msg, event) => events.push(event),
  });
  // A user must be logged in before sessions can be created.
  const u = services.auth.addUser({
    firstName: 'Test',
    lastName: 'User',
    role: 'mechanic',
    language: 'en',
    pin: '1234',
  });
  services.auth.login(u.id, '1234');
  const store = createSessionStore(services);
  return { store, services, events };
}

const PLATE = '123-45-678';
const okOcr: OcrResult = { candidates: [{ text: '12345678', confidence: 0.97 }] };

async function seedTmp(services: Harness['services']): Promise<void> {
  await services.fs.writeFile('/tmp/plate.jpg', 'IMG');
  await services.fs.writeFile('/tmp/shot.jpg', 'IMG');
  await services.fs.writeFile('/tmp/clip.mp4', 'BIN');
}

describe('sessionStore — recognizePlate', () => {
  it('returns a formatted plate for a confident candidate', async () => {
    const { store } = harness(okOcr);
    const res = await store.getState().recognizePlate('/tmp/plate.jpg');
    expect(res).toEqual({ ok: true, format: 'old', plate: PLATE });
  });

  it('returns low_confidence below threshold (retake path)', async () => {
    const { store } = harness({ candidates: [{ text: '12345678', confidence: 0.5 }] });
    const res = await store.getState().recognizePlate('/tmp/plate.jpg');
    expect(res).toEqual({ ok: false, reason: 'low_confidence' });
  });
});

describe('sessionStore — full lifecycle', () => {
  it('start -> photo -> video -> description -> finish', async () => {
    const { store, services, events } = harness(okOcr);
    await seedTmp(services);

    await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    expect(store.getState().active?.status).toBe('open');
    expect(store.getState().active?.plate_number).toBe(PLATE);
    expect(store.getState().uploads['plate.jpg']).toBe('pending');

    await store.getState().addPhoto('/tmp/shot.jpg');
    await store.getState().addVideo('/tmp/clip.mp4', 34);
    await store.getState().setDescription('Трещина в блоке цилиндров.');

    const active = store.getState().active;
    expect(active?.files.map(f => f.name)).toEqual([
      'plate.jpg',
      'photo_001.jpg',
      'video_001.mp4',
    ]);
    expect(active?.description).toBe('Трещина в блоке цилиндров.');
    expect(store.getState().uploads['video_001.mp4']).toBe('pending');

    // Card type is mandatory before finishing; it also adds the folder letter.
    await store.getState().setOrderType('warranty');
    await store.getState().finish();
    expect(store.getState().active).toBeNull();

    // уведомления: открытие + закрытие
    expect(events.find(e => e.kind === 'caseOpened')).toBeDefined();
    const closed = events.find(e => e.kind === 'caseClosed');
    expect(closed).toMatchObject({ kind: 'caseClosed', plate: PLATE, fileCount: 3 });
  });

  it('lists the open session in bootstrap and resumes it', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const caseId = await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    store.getState().leaveActive();
    expect(store.getState().active).toBeNull();

    await store.getState().bootstrap();
    expect(store.getState().openSessions.map(s => s.plate_number)).toEqual([PLATE]);
    expect(store.getState().openSessions[0]?.case_id).toBe(caseId);

    await store.getState().resume(caseId);
    expect(store.getState().active?.plate_number).toBe(PLATE);
    expect(store.getState().active?.case_id).toBe(caseId);
  });

  it('finish is idempotent: a second finish does not throw and closes once', async () => {
    const { store, services, events } = harness(okOcr);
    await seedTmp(services);
    await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    await store.getState().setOrderType('warranty');

    await store.getState().finish();
    // Repeat tap after the session is already closed must be a no-op, not a throw.
    await expect(store.getState().finish()).resolves.toBeUndefined();

    expect(events.filter(e => e.kind === 'caseClosed')).toHaveLength(1);
  });

  it('surfaces the READ ONLY invariant as an error after finish', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const caseId = await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    await store.getState().setOrderType('warranty');
    await store.getState().finish();

    // The folder was renamed to <base>_w on close; resume the closed case there.
    await store.getState().resume(`${caseId}_w`);
    await expect(store.getState().addPhoto('/tmp/shot.jpg')).rejects.toThrow();
    expect(store.getState().error).toContain('закрыт');

    // tamper.log зафиксировал попытку
    const log = await services.fs.readFile('/data/cases/tamper.log');
    expect(log).toContain('addPhoto');
  });

  it('blocks finish until the card type (order_type) is selected', async () => {
    const { store, services, events } = harness(okOcr);
    await seedTmp(services);
    await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');

    await store.getState().finish(); // no order_type yet
    expect(store.getState().active).not.toBeNull();
    expect(store.getState().error).toBe('session.orderTypeRequired');
    expect(events.filter(e => e.kind === 'caseClosed')).toHaveLength(0);
  });

  it('queues nothing while the session is open; enqueues the whole case at finish', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const openId = await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    await store.getState().addPhoto('/tmp/shot.jpg');

    // Open session: NOTHING is queued, so the PC folder is never created before
    // finish (even if the app restarts and flushes the queue in the background).
    expect(services.index.getQueue()).toHaveLength(0);

    await store.getState().setOrderType('warranty');
    await store.getState().finish();

    // Finish enqueues every file under the FINAL (…_w) case id.
    const q = services.index.getQueue();
    expect(q.map(i => i.fileName).sort()).toEqual(['photo_001.jpg', 'plate.jpg']);
    expect(q.every(i => i.filePath.startsWith(`${openId}_w/`))).toBe(true);
  });

  it('deleteFile removes a photo from the active case and its upload queue', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const a = await store.getState().startCase('11-111-11', '/tmp/plate.jpg', '113100');
    await store.getState().addPhoto('/tmp/shot.jpg');
    expect(store.getState().active?.files.map(f => f.name)).toContain('photo_001.jpg');

    await store.getState().deleteFile('photo_001.jpg');

    // Gone from the active meta, the queue and the uploads badge map.
    expect(store.getState().active?.files.map(f => f.name)).toEqual(['plate.jpg']);
    expect(services.index.getQueue().some(q => q.filePath === `${a}/photo_001.jpg`)).toBe(false);
    expect(store.getState().uploads['photo_001.jpg']).toBeUndefined();
  });

  it('deleteFile refuses to delete the plate photo', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    await store.getState().startCase('11-111-11', '/tmp/plate.jpg', '113100');
    await expect(store.getState().deleteFile('plate.jpg')).rejects.toThrow();
    expect(store.getState().active?.files.map(f => f.name)).toEqual(['plate.jpg']);
  });

  it('resendCase re-queues only the selected case', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const a = await store.getState().startCase('11-111-11', '/tmp/plate.jpg', '113100');
    await store.getState().addPhoto('/tmp/shot.jpg');
    store.getState().leaveActive();
    await services.fs.writeFile('/tmp/plateB.jpg', 'IMGB');
    const b = await store.getState().startCase('22-222-22', '/tmp/plateB.jpg', '113200');
    store.getState().leaveActive();

    // Files are queued only at finish; simulate two ALREADY-UPLOADED cases by
    // seeding the queue directly (open sessions never enqueue anything).
    for (const fp of [`${a}/plate.jpg`, `${a}/photo_001.jpg`, `${b}/plate.jpg`]) {
      services.index.enqueueUpload({
        filePath: fp,
        plateNumber: 'x',
        fileName: fp.slice(fp.indexOf('/') + 1),
        status: 'uploaded',
        attempts: 0,
        enqueuedAt: '2026-05-25T09:14:00.000Z',
      });
    }

    // listResendCases returns both.
    const list = await store.getState().listResendCases();
    expect(list.map(c => c.case_id).sort()).toEqual([a, b].sort());

    // Re-send ONLY A: its files are re-armed (pending); B stays uploaded.
    await store.getState().resendCase(a);
    const q = services.index.getQueue();
    expect(q.find(i => i.filePath === `${a}/photo_001.jpg`)?.status).not.toBe('uploaded');
    expect(q.find(i => i.filePath === `${b}/plate.jpg`)?.status).toBe('uploaded');
  });

  it('resendAllCases re-queues every file of every case on disk', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    // Two cases; the first is finished (its files marked 'uploaded').
    const a = await store.getState().startCase('11-111-11', '/tmp/plate.jpg', '113100');
    await store.getState().addPhoto('/tmp/shot.jpg');
    services.index.updateUploadStatus(`${a}/plate.jpg`, 'uploaded');
    services.index.updateUploadStatus(`${a}/photo_001.jpg`, 'uploaded');
    store.getState().leaveActive();
    await services.fs.writeFile('/tmp/plateB.jpg', 'IMGB');
    const b = await store.getState().startCase('22-222-22', '/tmp/plateB.jpg', '113200');

    const n = await store.getState().resendAllCases();
    expect(n).toBe(2);
    // Every file of every case is back in the queue (statuses re-armed).
    const paths = services.index.getQueue().map(q => q.filePath).sort();
    expect(paths).toEqual([`${a}/photo_001.jpg`, `${a}/plate.jpg`, `${b}/plate.jpg`].sort());
  });

  it('keeps a session saved on leave and lets you switch and resume it', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);

    // Session A for one car: scan + a photo, then leave WITHOUT finishing.
    const caseA = await store.getState().startCase('11-111-11', '/tmp/plate.jpg', '113100');
    await store.getState().addPhoto('/tmp/shot.jpg');
    store.getState().leaveActive();
    expect(store.getState().active).toBeNull();

    // A second car meanwhile.
    await services.fs.writeFile('/tmp/plateB.jpg', 'IMGB');
    const caseB = await store.getState().startCase('22-222-22', '/tmp/plateB.jpg', '113200');
    expect(caseB).not.toBe(caseA);

    // Both show up as open sessions with their order numbers.
    await store.getState().bootstrap();
    const open = store.getState().openSessions;
    expect(open.map(o => o.order_number).sort()).toEqual(['113100', '113200']);

    // Resume A: its earlier photo is still there.
    await store.getState().resume(caseA);
    expect(store.getState().active?.case_id).toBe(caseA);
    expect(store.getState().active?.files.map(f => f.name)).toEqual(['plate.jpg', 'photo_001.jpg']);
  });

  it('renames the folder and repoints the upload queue on finish', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    const caseId = await store.getState().startCase(PLATE, '/tmp/plate.jpg', '113188');
    await store.getState().addPhoto('/tmp/shot.jpg');
    await store.getState().setOrderType('recall');
    await store.getState().finish();

    const finalId = `${caseId}_r`;
    expect((await services.files.readSession(finalId)).order_type).toBe('recall');
    const queue = services.index.getQueue();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every(i => i.filePath.startsWith(`${finalId}/`))).toBe(true);
  });
});
