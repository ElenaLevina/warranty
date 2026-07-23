/**
 * Доменные типы сессии. Форма SessionMeta строго соответствует
 * references/session.schema.json и сериализуется в session.json как есть
 * (поэтому snake_case — это намеренно, чтобы сериализация была тривиальной).
 */

export type SessionStatus = 'open' | 'closed';

export type CaseFileType = 'photo' | 'video';

/** Card type (סוג כרטיס). Folder suffix letter: warranty -> w, recall -> r. */
export type OrderType = 'warranty' | 'recall';

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
   * Case id = folder name: `<plate>_<order>_<YYYYMMDD>` while open, and
   * `<plate>_<order>_<YYYYMMDD>_<w|r>` once the card type is chosen at finish.
   * Same-day repeats for the same plate+order get a `-2`, `-3` suffix.
   */
  case_id: string;
  /** Отформатированный номер с дефисами: XXX-XX-XXX | XX-XXX-XX. */
  plate_number: string;
  /** 6-digit repair-order number scanned from the work-order form. */
  order_number?: string;
  /** Card type (סוג כרטיס). Folder suffix: warranty -> w, recall -> r. */
  order_type?: OrderType;
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
  /**
   * Optional "recommendation" (המלצה) flag ticked by the mechanic. Off by
   * default. When on, a plain-text recommendation.txt is materialized in the
   * case folder at finish and uploaded to the PC alongside the media.
   */
  recommendation?: boolean;
  status: SessionStatus;
}

/** Summary of any case (open or closed) — used by the recovery/re-send list. */
export interface CaseListItem {
  case_id: string;
  plate_number: string;
  order_number?: string;
  order_type?: OrderType;
  session_start: string;
  file_count: number;
  status: SessionStatus;
}

/** Краткая запись об открытой сессии для стартового экрана/индекса. */
export interface OpenSessionSummary {
  /** Идентификатор кейса (имя папки) — по нему возобновляют сессию. */
  case_id: string;
  plate_number: string;
  /** 6-digit repair-order number, shown in the unfinished-sessions list. */
  order_number?: string;
  session_start: string;
  file_count: number;
}
