/**
 * Feature flags for switching from the mock slice to real native capabilities.
 *
 * On the emulator slice and in Node tests these are irrelevant: tests build
 * services via createTestServices (mock OCR, dev camera, passthrough crypto) and
 * stay green without a device. The flags only affect createAppServices (the real
 * app build).
 *
 * On a PHYSICAL PHONE, enable the flags you need and rebuild (`npm run android`):
 *   - realCamera   -> live vision-camera preview (photo/video)
 *   - nativeOcr    -> plate recognition via ML Kit (WarrantyOcr native module)
 *   - nativeCrypto -> at-rest encryption via Android Keystore (WarrantyCrypto)
 *
 * NOTE: enabling nativeCrypto encrypts session.json and media. Cases recorded
 * BEFORE enabling it are plaintext and will fail to decrypt — clear app data
 * once when turning it on for dev: `adb shell pm clear com.warranty`.
 */
export const FEATURES = {
  realCamera: true,
  nativeOcr: true,
  nativeCrypto: true,
} as const;

export type Features = typeof FEATURES;
