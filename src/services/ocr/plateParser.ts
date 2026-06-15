/**
 * Парсер израильских номерных знаков (чистый TS, без зависимостей от устройства).
 *
 * Форматы (ТОЛЬКО ЦИФРЫ — согласовано как допущение для заказчика; в ТЗ старый
 * формат ошибочно описан как «3 цифры — 2 буквы — 3 цифры», но пример 123-45-678
 * и израильский стандарт — цифровые):
 *   - Старый: XXX-XX-XXX  (8 цифр, группы 3-2-3)
 *   - Новый:  XX-XXX-XX   (7 цифр, группы 2-3-2)
 *
 * Источник правил: .claude/skills/warranty-module/references/plate_formats.md
 */
import type { OcrCandidate, PlateResult } from '../../types';
import { APP_CONFIG } from '../../config';

const OLD = /^\d{8}$/; // 3-2-3
const NEW = /^\d{7}$/; // 2-3-2

/** Оставить только цифры из строки. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * Отформатировать строку ЦИФР в стандартный номер с дефисами.
 * Возвращает not_found, если длина не соответствует ни одному формату.
 */
export function formatPlate(digits: string): PlateResult {
  if (OLD.test(digits)) {
    return {
      ok: true,
      format: 'old',
      plate: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`,
    };
  }
  if (NEW.test(digits)) {
    return {
      ok: true,
      format: 'new',
      plate: `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`,
    };
  }
  return { ok: false, reason: 'not_found' };
}

interface ScoredCandidate {
  res: Extract<PlateResult, { ok: true }>;
  confidence: number;
  /** Bounding box area (px²); 0 when geometry is unknown. */
  area: number;
  /** Bounding box top (px); 0 when unknown. */
  top: number;
}

/**
 * Выбрать лучший номер из кандидатов OCR.
 * 1. Для каждого кандидата извлечь цифры и попробовать распознать формат.
 * 2. Отфильтровать валидные.
 * 3. Приоритет — БЛИЖНИЙ/ПЕРЕДНИЙ номер: сортировка по убыванию площади box
 *    (крупнее = ближе к камере), затем ниже в кадре, затем по уверенности.
 *    Это решает кейс «несколько машин в кадре»: выбираем самую близкую табличку,
 *    а не дальнюю (например, авто на подъёмнике на фоне).
 *    Когда геометрии нет (mock/тесты) — выбор фактически по уверенности.
 * 4. Нет валидных -> not_found.
 * 5. Лучший ниже порога -> low_confidence (папку НЕ создавать).
 */
export function pickPlate(
  candidates: readonly OcrCandidate[],
  threshold: number = APP_CONFIG.ocrConfidenceThreshold,
): PlateResult {
  const parsed = candidates
    .map(c => ({
      res: formatPlate(digitsOnly(c.text)),
      confidence: c.confidence,
      area: c.boxArea ?? 0,
      top: c.boxTop ?? 0,
    }))
    .filter((c): c is ScoredCandidate => c.res.ok)
    .sort((a, b) => b.area - a.area || b.top - a.top || b.confidence - a.confidence);

  const best = parsed[0];
  if (best === undefined) {
    return { ok: false, reason: 'not_found' };
  }
  if (best.confidence < threshold) {
    return { ok: false, reason: 'low_confidence' };
  }
  return best.res;
}
