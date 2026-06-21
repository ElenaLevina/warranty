/**
 * Composition root: сборка набора сервисов.
 *  - createRealServices() — для приложения (RNFS, MMKV, mock-OCR в срезе).
 *  - createTestServices() — для юнит-тестов (in-memory ФС, без устройства).
 *
 * OCR в срезе — MockOcrService (реальный ML Kit мост — Фаза 6).
 * Crypto в срезе — passthrough (реальный Keystore — Фаза 7).
 */
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config';
import type { FileSystem } from './files/fileSystem';
import { RnfsFileSystem } from './files/rnfsFileSystem';
import { InMemoryFileSystem } from './files/inMemoryFileSystem';
import { FilesService } from './files/filesService';
import { PassthroughCryptoService, type CryptoService } from './crypto/cryptoService';
import { MmkvStorageIndex, type StorageIndex } from './storage/storageIndex';
import { StubUploadService, type UploadService } from './upload/uploadService';
import { HttpUploadService } from './upload/httpUploadService';
import { MmkvUploadConfig, type UploadConfig } from './upload/uploadConfig';
import { RnfsHttpTransport } from './upload/rnfsHttpTransport';
import { StubNotifyService, type NotifyService, type NotifySink } from './notify/notifyService';
import { MockOcrService, type OcrService } from './ocr/ocrService';
import { DevCameraService, type CameraService } from './camera/cameraService';
import { MmkvAuthService, type AuthService } from './auth/authService';
import { MmkvDeviceService, type DeviceService } from './device/deviceService';
import type { OcrResult } from '../types';

/**
 * Переопределения сервисов нативными реализациями (на устройстве):
 *  - ocr: MlKitOcrService (Фаза 6)
 *  - crypto: KeystoreCryptoService (Фаза 7)
 * Если не переданы — используется mock-OCR и passthrough-crypto (срез/эмулятор).
 */
export interface NativeOverrides {
  ocr?: OcrService;
  crypto?: CryptoService;
}

export interface AppServices {
  config: AppConfig;
  fs: FileSystem;
  crypto: CryptoService;
  files: FilesService;
  index: StorageIndex;
  upload: UploadService;
  notify: NotifyService;
  ocr: OcrService;
  camera: CameraService;
  auth: AuthService;
  device: DeviceService;
  uploadConfig: UploadConfig;
}

export interface RealServicesOptions {
  casesRoot: string;
  /** Каталог для временных кадров камеры. */
  tmpDir: string;
  notifySink: NotifySink;
  /** Скрипт mock-OCR на время среза (до нативного моста). */
  ocrScript: OcrResult | ((imagePath: string) => OcrResult);
  /** Ключ шифрования MMKV-индекса (из Keystore в Фазе 7). */
  indexEncryptionKey?: string;
  /** Нативные реализации (на устройстве). Без них — mock/passthrough. */
  native?: NativeOverrides;
}

export function createRealServices(opts: RealServicesOptions): AppServices {
  const fs = new RnfsFileSystem();
  const crypto = opts.native?.crypto ?? new PassthroughCryptoService(fs);
  const files = new FilesService(fs, crypto, opts.casesRoot);
  const index = new MmkvStorageIndex(opts.indexEncryptionKey);
  const uploadConfig = new MmkvUploadConfig(opts.indexEncryptionKey);
  // Real LAN upload to the PC receiver; no-ops until configured/enabled in Settings.
  const upload = new HttpUploadService({
    config: uploadConfig,
    index,
    crypto,
    fs,
    transport: new RnfsHttpTransport(),
    casesRoot: opts.casesRoot,
  });
  const notify = new StubNotifyService(opts.notifySink);
  const ocr = opts.native?.ocr ?? new MockOcrService(opts.ocrScript);
  const camera = new DevCameraService(fs, opts.tmpDir);
  const auth = new MmkvAuthService(opts.indexEncryptionKey);
  const device = new MmkvDeviceService(opts.indexEncryptionKey);
  return { config: APP_CONFIG, fs, crypto, files, index, upload, notify, ocr, camera, auth, device, uploadConfig };
}

export interface TestServicesOptions {
  casesRoot?: string;
  notifySink?: NotifySink;
  ocrScript?: OcrResult | ((imagePath: string) => OcrResult);
  now?: () => Date;
}

export function createTestServices(opts: TestServicesOptions = {}): AppServices & { fs: InMemoryFileSystem } {
  const casesRoot = opts.casesRoot ?? '/data/cases';
  const fs = new InMemoryFileSystem();
  const crypto = new PassthroughCryptoService(fs);
  const files = new FilesService(fs, crypto, casesRoot, opts.now);
  // In-memory StorageIndex поверх MMKV-мока (jest.setup). Достаточно для тестов.
  const index = new MmkvStorageIndex();
  index.clear();
  const upload = new StubUploadService(index);
  const notify = new StubNotifyService(opts.notifySink ?? (() => {}));
  const ocr = new MockOcrService(opts.ocrScript ?? { candidates: [] });
  const camera = new DevCameraService(fs, '/data/tmp');
  const auth = new MmkvAuthService();
  const device = new MmkvDeviceService();
  const uploadConfig = new MmkvUploadConfig();
  return { config: APP_CONFIG, fs, crypto, files, index, upload, notify, ocr, camera, auth, device, uploadConfig };
}
