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
  // A mechanic must be unlocked before sessions can be created.
  services.auth.register('tester', '1234');
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

    await store.getState().startCase(PLATE, '/tmp/plate.jpg');
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
    await store.getState().startCase(PLATE, '/tmp/plate.jpg');
    store.getState().leaveActive();
    expect(store.getState().active).toBeNull();

    await store.getState().bootstrap();
    expect(store.getState().openSessions.map(s => s.plate_number)).toEqual([PLATE]);

    await store.getState().resume(PLATE);
    expect(store.getState().active?.plate_number).toBe(PLATE);
  });

  it('surfaces the READ ONLY invariant as an error after finish', async () => {
    const { store, services } = harness(okOcr);
    await seedTmp(services);
    await store.getState().startCase(PLATE, '/tmp/plate.jpg');
    await store.getState().finish();

    // активной сессии нет -> резюмируем закрытую и пытаемся писать
    await store.getState().resume(PLATE);
    await expect(store.getState().addPhoto('/tmp/shot.jpg')).rejects.toThrow();
    expect(store.getState().error).toContain('закрыт');

    // tamper.log зафиксировал попытку
    const log = await services.fs.readFile('/data/cases/tamper.log');
    expect(log).toContain('addPhoto');
  });
});
