/**
 * Сборка реальных сервисов приложения (RNFS-пути, MMKV, тосты).
 * OCR в срезе — детерминированный mock-скрипт, генерирующий валидные номера,
 * чтобы сквозной поток работал на эмуляторе без камеры/ML Kit.
 * Реальный ML Kit мост (Фаза 6) и Keystore (Фаза 7) подменяют соответствующие
 * сервисы без изменений в UI.
 */
import { Platform, ToastAndroid } from 'react-native';
import RNFS from 'react-native-fs';
import { createRealServices, type AppServices, type NativeOverrides } from '../services/container';
import { MlKitOcrService } from '../services/ocr/ocrService';
import { KeystoreCryptoService } from '../services/crypto/keystoreCryptoService';
import { FEATURES } from './featureFlags';
import type { OcrResult } from '../types';
import type { NotifyEvent } from '../services/notify/notifyService';

/** Dev-OCR: выдаёт валидные номера по кругу, чтобы демонстрировать поток. */
function makeDevOcrScript(): (imagePath: string) => OcrResult {
  let counter = 12_345_670;
  return () => {
    const digits = String(counter++).padStart(8, '0').slice(0, 8);
    return { candidates: [{ text: digits, confidence: 0.97 }] };
  };
}

function toastSink(message: string, _event: NotifyEvent): void {
  if (message.length === 0) {
    return; // тихие события (например, fileUploaded)
  }
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
  // iOS вне скоупа v1.0 — на не-Android платформах тосты не показываем.
}

export function createAppServices(): AppServices {
  const casesRoot = `${RNFS.DocumentDirectoryPath}/cases`;
  const tmpDir = `${RNFS.DocumentDirectoryPath}/tmp`;
  const native: NativeOverrides = {
    ...(FEATURES.nativeOcr ? { ocr: new MlKitOcrService() } : {}),
    ...(FEATURES.nativeCrypto ? { crypto: new KeystoreCryptoService() } : {}),
  };
  return createRealServices({
    casesRoot,
    tmpDir,
    notifySink: toastSink,
    ocrScript: makeDevOcrScript(),
    native,
  });
}
