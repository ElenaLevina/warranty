/**
 * Типы OCR и результата парсинга израильского номера.
 */

export type PlateFormat = 'old' | 'new';

/** Один распознанный блок текста от OCR-движка. */
export interface OcrCandidate {
  text: string;
  /** Уверенность 0..1. Порог принятия — 0.85. */
  confidence: number;
  /**
   * Площадь bounding box в пикселях² (ширина×высота). Прокси расстояния до авто:
   * чем ближе машина, тем крупнее её номер в кадре. Используется для приоритета
   * переднего/ближнего номера, когда в кадре несколько машин. Может отсутствовать
   * (mock/тесты) — тогда выбор идёт по уверенности.
   */
  boxArea?: number;
  /** Верхняя координата box (px). Ниже в кадре обычно = ближе. Тай-брейк. */
  boxTop?: number;
}

/** Сырой результат OcrService (до парсинга номера). */
export interface OcrResult {
  candidates: OcrCandidate[];
}

/** Результат разбора номера из кандидатов. */
export type PlateResult =
  | { ok: true; plate: string; format: PlateFormat }
  | { ok: false; reason: 'not_found' | 'low_confidence' };
