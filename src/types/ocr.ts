/**
 * Типы OCR и результата парсинга израильского номера.
 */

export type PlateFormat = 'old' | 'new';

/** Один распознанный блок текста от OCR-движка. */
export interface OcrCandidate {
  text: string;
  /** Уверенность 0..1. Порог принятия — 0.85. */
  confidence: number;
}

/** Сырой результат OcrService (до парсинга номера). */
export interface OcrResult {
  candidates: OcrCandidate[];
}

/** Результат разбора номера из кандидатов. */
export type PlateResult =
  | { ok: true; plate: string; format: PlateFormat }
  | { ok: false; reason: 'not_found' | 'low_confidence' };
