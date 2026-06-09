/**
 * Порт шифрования at-rest. В срезе — passthrough; реальная реализация
 * (Android Keystore + AES-GCM) добавляется в Фазе 7 без изменения вызывающего кода.
 */
import type { FileSystem } from '../files/fileSystem';

export interface CryptoService {
  /** Зашифровать UTF-8 текст (для session.json / индекса). */
  encryptText(plain: string): Promise<string>;
  /** Расшифровать текст, сохранённый encryptText. */
  decryptText(cipher: string): Promise<string>;
  /** Зашифровать файл-источник (временный кадр камеры) в destPath at-rest. */
  sealFile(srcPath: string, destPath: string): Promise<void>;
  /**
   * Подготовить читаемый путь к зашифрованному файлу (расшифровать во временный).
   * Passthrough возвращает исходный путь (файл уже читаемый).
   */
  openFile(srcPath: string): Promise<string>;
  /**
   * Delete leftover decrypted temp files (created by openFile previews).
   * Optional: passthrough has nothing to clean. Called on app start.
   */
  clearDecryptedCache?(): Promise<void>;
}

/**
 * Passthrough: без реального шифрования. Сохраняет контракт, чтобы UI/файловый
 * слой писались против него, а Keystore-реализация подменялась в Фазе 7.
 */
export class PassthroughCryptoService implements CryptoService {
  constructor(private readonly fs: FileSystem) {}

  async encryptText(plain: string): Promise<string> {
    return plain;
  }

  async decryptText(cipher: string): Promise<string> {
    return cipher;
  }

  async sealFile(srcPath: string, destPath: string): Promise<void> {
    await this.fs.copyFile(srcPath, destPath);
  }

  async openFile(srcPath: string): Promise<string> {
    return srcPath;
  }
}
