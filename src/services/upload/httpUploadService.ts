/**
 * HttpUploadService — real upload to the PC receiver over the LAN.
 *
 * Pipeline per file:
 *   enqueue -> StorageIndex (status 'pending') -> tryUpload:
 *     decrypt at-rest file via CryptoService.openFile (readable temp) ->
 *     transport.uploadFile -> on success status 'uploaded' (+ cleanup temp);
 *     on failure status 'error' (stays queued for retry).
 *
 * Offline: when disabled or no baseUrl, items stay 'pending'. processQueue()
 * retries everything not yet uploaded (called on app start and on network
 * regained). completeCase() posts session.json after the case is closed (§7).
 */
import type { UploadService } from './uploadService';
import type { UploadConfig } from './uploadConfig';
import type { UploadTransport } from './uploadTransport';
import type { StorageIndex } from '../storage/storageIndex';
import type { CryptoService } from '../crypto/cryptoService';
import type { FileSystem } from '../files/fileSystem';
import type { UploadQueueItem, UploadStatus } from '../../types';

export interface HttpUploadDeps {
  config: UploadConfig;
  index: StorageIndex;
  crypto: CryptoService;
  fs: FileSystem;
  transport: UploadTransport;
  /** Root dir of case folders; queue filePath is relative to it (`caseId/name`). */
  casesRoot: string;
  /** Optional hook so the UI can reflect live status changes. */
  onStatus?: (fileName: string, status: UploadStatus) => void;
}

export class HttpUploadService implements UploadService {
  constructor(private readonly deps: HttpUploadDeps) {}

  async enqueue(item: UploadQueueItem): Promise<void> {
    this.deps.index.enqueueUpload({ ...item, status: 'pending' });
    await this.tryUpload(item);
  }

  async processQueue(): Promise<void> {
    const pending = this.deps.index.getQueue().filter(i => i.status !== 'uploaded');
    for (const item of pending) {
      // Sequential to keep memory/network sane (videos can be large).
      // eslint-disable-next-line no-await-in-loop
      await this.tryUpload(item);
    }
  }

  async completeCase(caseId: string, sessionJson: string): Promise<void> {
    const { config, transport } = this.deps;
    const s = config.get();
    if (!s.enabled || s.baseUrl.length === 0) {
      return;
    }
    await transport.complete({ baseUrl: s.baseUrl, token: s.token, caseId, sessionJson });
  }

  async checkConnection(): Promise<boolean> {
    const s = this.deps.config.get();
    if (s.baseUrl.length === 0) {
      return false;
    }
    return this.deps.transport.health(s.baseUrl, s.token);
  }

  private setStatus(item: UploadQueueItem, status: UploadStatus): void {
    this.deps.index.updateUploadStatus(item.filePath, status);
    this.deps.onStatus?.(item.fileName, status);
  }

  private async tryUpload(item: UploadQueueItem): Promise<void> {
    const { config, crypto, fs, transport, casesRoot } = this.deps;
    const s = config.get();
    if (!s.enabled || s.baseUrl.length === 0) {
      return; // offline/not configured: leave it pending
    }

    this.setStatus(item, 'uploading');
    const sealedPath = `${casesRoot}/${item.filePath}`;
    let readablePath: string | null = null;
    try {
      // Decrypt to a readable temp path (passthrough returns the same path).
      readablePath = await crypto.openFile(sealedPath);
      const type = item.fileName.endsWith('.mp4') ? 'video' : 'photo';
      await transport.uploadFile({
        baseUrl: s.baseUrl,
        token: s.token,
        caseId: deriveCaseId(item.filePath),
        filePath: readablePath,
        fileName: item.fileName,
        type,
      });
      this.setStatus(item, 'uploaded');
    } catch {
      this.setStatus(item, 'error');
    } finally {
      // Remove the decrypted temp copy if it differs from the sealed file.
      if (readablePath !== null && readablePath !== sealedPath) {
        await fs.unlink(readablePath).catch(() => undefined);
      }
    }
  }
}

/** Queue filePath is `caseId/fileName`; the caseId is everything before the last slash. */
function deriveCaseId(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx <= 0 ? filePath : filePath.slice(0, idx);
}
