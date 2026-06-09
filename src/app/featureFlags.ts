/**
 * Фичефлаги для перехода с mock-среза на реальные нативные возможности.
 *
 * По умолчанию ВСЁ выключено — так эмулятор-срез и Node-тесты используют
 * mock-OCR, dev-камеру и passthrough-crypto и остаются зелёными без устройства.
 *
 * На ФИЗИЧЕСКОМ ТЕЛЕФОНЕ включите нужные флаги и пересоберите (`npm run android`):
 *   - realCamera   → живая камера vision-camera (live-preview, фото/видео)
 *   - nativeOcr    → распознавание номера через ML Kit (модуль WarrantyOcr)
 *   - nativeCrypto → шифрование at-rest через Android Keystore (модуль WarrantyCrypto)
 *
 * Текущая итерация (по согласованию): камера + OCR реальные, шифрование позже.
 */
export const FEATURES = {
  realCamera: true,
  nativeOcr: true,
  nativeCrypto: false,
} as const;

export type Features = typeof FEATURES;
