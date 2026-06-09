import type { SessionMeta } from './session';

/**
 * Тип-тест: пример из ТЗ должен удовлетворять SessionMeta на этапе компиляции.
 * Если тип разойдётся со схемой — tsc упадёт здесь.
 */
const example: SessionMeta = {
  plate_number: '123-45-678',
  session_start: '2026-05-25T09:14:00',
  session_end: '2026-05-25T09:31:00',
  mechanic_id: 'user_042',
  files: [
    { name: 'plate.jpg', type: 'photo', timestamp: '09:14:22' },
    { name: 'photo_001.jpg', type: 'photo', timestamp: '09:18:05' },
    { name: 'video_001.mp4', type: 'video', timestamp: '09:22:11', duration_sec: 34 },
  ],
  description: 'Трещина в блоке цилиндров. Замена блока.',
  status: 'closed',
};

const openExample: SessionMeta = {
  plate_number: '12-345-67',
  session_start: '2026-05-25T09:14:00',
  session_end: null, // open -> null
  mechanic_id: 'user_042',
  files: [],
  description: '',
  status: 'open',
};

describe('SessionMeta type', () => {
  it('accepts the spec example (closed)', () => {
    expect(example.status).toBe('closed');
    expect(example.files).toHaveLength(3);
  });

  it('accepts an open session with null session_end', () => {
    expect(openExample.session_end).toBeNull();
    expect(openExample.status).toBe('open');
  });
});
