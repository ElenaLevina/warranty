/**
 * KeystoreCryptoService (Фаза 7) — реальная реализация CryptoService поверх
 * нативного модуля WarrantyCrypto (Android Keystore, AES-256-GCM).
 *
 * Работает только в сборке на устройстве, где зарегистрирован нативный модуль.
 * Подменяет PassthroughCryptoService без изменений в FilesService/UI.
 */
import { NativeModules } from 'react-native';
import type { CryptoService } from './cryptoService';

/** Контракт нативного модуля WarrantyCrypto (android/.../crypto/CryptoModule.kt). */
interface WarrantyCryptoNative {
  encryptText(plain: string): Promise<string>;
  decryptText(cipher: string): Promise<string>;
  sealFile(srcPath: string, destPath: string): Promise<void>;
  openFile(srcPath: string): Promise<string>;
  clearDecryptedCache(): Promise<void>;
}

export class KeystoreCryptoService implements CryptoService {
  private readonly native = (NativeModules as { WarrantyCrypto?: WarrantyCryptoNative })
    .WarrantyCrypto;

  private module(): WarrantyCryptoNative {
    if (this.native === undefined) {
      throw new Error(
        'Нативный модуль WarrantyCrypto недоступен. Соберите приложение на устройстве (Фаза 7).',
      );
    }
    return this.native;
  }

  encryptText(plain: string): Promise<string> {
    return this.module().encryptText(plain);
  }

  decryptText(cipher: string): Promise<string> {
    return this.module().decryptText(cipher);
  }

  sealFile(srcPath: string, destPath: string): Promise<void> {
    return this.module().sealFile(srcPath, destPath);
  }

  openFile(srcPath: string): Promise<string> {
    return this.module().openFile(srcPath);
  }

  clearDecryptedCache(): Promise<void> {
    return this.module().clearDecryptedCache();
  }
}
