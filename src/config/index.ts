/**
 * Конфигурация приложения. В итерации 1 (без серверного auth) mechanicId —
 * фиксированное значение; в следующей итерации заменяется идентичностью из auth.
 */
export const APP_CONFIG = {
  /** App version shown in Settings (bump together with android versionName). */
  appVersion: '1.4.15',
  /** Where the "Update the app" button sends the phone to download a new APK. */
  updateUrl: 'http://192.168.68.122:8000',
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
