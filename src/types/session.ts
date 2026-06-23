/**
 * Доменные типы сессии. Форма SessionMeta строго соответствует
 * references/session.schema.json и сериализуется в session.json как есть
 * (поэтому snake_case — это намеренно, чтобы сериализация была тривиальной).
 */

export type SessionStatus = 'open' | 'closed';

export type CaseFileType = 'photo' | 'video';

/** Элемент массива files[] в session.json. */
export interface CaseFileEntry {
  /** Имя файла внутри папки кейса: plate.jpg | photo_NNN.jpg | video_NNN.mp4 */
  name: string;
  type: CaseFileType;
  /** Время съёмки "HH:MM:SS" (как в ТЗ). */
  timestamp: string;
  /** Длительность видео в секундах, 0..180. Только для type === 'video'. */
  duration_sec?: number;
}

/** Содержимое session.json. Источник правды о сессии на диске. */
export interface SessionMeta {
  /**
   * Уникальный идентификатор кейса = имя папки: `<номер>_<дата-время>_<rand>`.
   * Позволяет несколько кейсов на один и тот же номер (разные гарантийные случаи).
   */
  case_id: string;
  /** Отформатированный номер с дефисами: XXX-XX-XXX | XX-XXX-XX. */
  plate_number: string;
  /** ISO date-time начала сессии. */
  session_start: string;
  /** ISO date-time окончания; null пока status === 'open'. */
  session_end: string | null;
  mechanic_id: string;
  /** Role of the user who recorded the case (metadata). */
  mechanic_role?: 'admin' | 'mechanic';
  /** Stable per-install device id that recorded the case (§8). */
  device_id?: string;
  files: CaseFileEntry[];
  /** Описание повреждений, вводит механик. */
  description: string;
  status: SessionStatus;
}

/** Краткая запись об открытой сессии для стартового экрана/индекса. */
export interface OpenSessionSummary {
  /** Идентификатор кейса (имя папки) — по нему возобновляют сессию. */
  case_id: string;
  plate_number: string;
  session_start: string;
  file_count: number;
}
