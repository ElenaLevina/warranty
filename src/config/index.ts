/**
 * Конфигурация приложения. В итерации 1 (без серверного auth) mechanicId —
 * фиксированное значение; в следующей итерации заменяется идентичностью из auth.
 */
export const APP_CONFIG = {
  /** Временный идентификатор механика до внедрения авторизации (Фаза auth). */
  mechanicId: 'user_042',
  /** Порог уверенности OCR для автосоздания кейса. */
  ocrConfidenceThreshold: 0.85,
  /** Максимальная длина одного видео, сек (ТЗ §6). */
  maxVideoDurationSec: 180,
  /** Корневая папка кейсов внутри app-internal storage. */
  casesDirName: 'cases',
} as const;

export type AppConfig = typeof APP_CONFIG;
