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
import type { PendingComplete, StorageIndex } from '../storage/storageIndex';
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
  /** Guard so overlapping triggers (app start + NetInfo events + finish) never
   *  run the queue concurrently — otherwise dead-Wi-Fi health probes pile up. */
  private running = false;
  /** Reason of the last failed upload, surfaced in the UI for field diagnosis. */
  private lastError = '';

  constructor(private readonly deps: HttpUploadDeps) {}

  lastUploadError(): string {
    return this.lastError;
  }

  async enqueue(item: UploadQueueItem): Promise<void> {
    // Queue only — NO per-file upload. Files are sent in the background on
    // "ЗАКОНЧИЛ" (and retried on reconnect). Per product decision this overrides
    // ТЗ §5.3 "upload immediately": per-photo upload made the UI hang.
    this.deps.index.enqueueUpload({ ...item, status: 'pending' });
  }

  async processQueue(): Promise<void> {
    this.lastError = '';
    const s = this.deps.config.get();
    if (!s.enabled || s.baseUrl.length === 0) {
      this.lastError = 'upload disabled or no PC address';
      return; // offline/not configured: leave everything pending
    }
    const pending = this.deps.index.getQueue().filter(i => i.status !== 'uploaded');
    const completes = this.deps.index.getPendingCompletes();
    if (pending.length === 0 && completes.length === 0) {
      return; // nothing to do: don't even probe
    }
    // Never run two passes at once. NetInfo can fire connectivity events in
    // bursts, and app-start + finish can overlap them; without this guard each
    // trigger launches its own (possibly hanging) health probe + upload loop.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.runPass(pending, completes);
    } finally {
      this.running = false;
    }
  }

  private async runPass(
    pending: UploadQueueItem[],
    completes: PendingComplete[],
  ): Promise<void> {
    // No fetch-based "health" pre-gate: the health probe uses a DIFFERENT
    // network stack than the actual upload (react-native-fs), so it could report
    // "unreachable" on a phone whose uploads work fine — silently blocking the
    // whole queue. Instead we use the REAL upload path as the reachability test:
    // try files sequentially, and if the FIRST one fails (server truly down) bail
    // out immediately so a big backlog is not ground through against a dead PC.
    let sent = 0;
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.tryUpload(item);
      if (ok) {
        sent += 1;
      } else if (sent === 0) {
        // The very first attempt failed -> receiver unreachable; stop the pass.
        // Remaining items stay queued for the next manual "Send to PC".
        return;
      }
      // A later failure (transient) just leaves that item queued; keep going.
    }
    // session.json of finished cases is (re)sent too, once files got through.
    for (const c of completes) {
      // eslint-disable-next-line no-await-in-loop
      await this.tryComplete(c.caseId, c.sessionJson);
    }
  }

  async completeCase(caseId: string, sessionJson: string): Promise<void> {
    // Persist first, remove on success — so an offline finish retries later
    // (on reconnect / next app start) instead of losing session.json forever.
    this.deps.index.setPendingComplete(caseId, sessionJson);
    await this.tryComplete(caseId, sessionJson);
  }

  private async tryComplete(caseId: string, sessionJson: string): Promise<void> {
    const { config, transport, index } = this.deps;
    const s = config.get();
    if (!s.enabled || s.baseUrl.length === 0) {
      return; // stays pending
    }
    try {
      await transport.complete({
        baseUrl: s.baseUrl,
        token: s.token,
        caseId,
        sessionJson,
      });
      index.removePendingComplete(caseId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[upload] complete failed ${caseId}:`, e instanceof Error ? e.message : e);
    }
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

  /** Upload one file. Returns true on success, false on failure (stays queued). */
  private async tryUpload(item: UploadQueueItem): Promise<boolean> {
    const { config, crypto, fs, transport, casesRoot } = this.deps;
    const s = config.get();
    if (!s.enabled || s.baseUrl.length === 0) {
      return false; // offline/not configured: leave it pending
    }

    this.setStatus(item, 'uploading');
    const sealedPath = `${casesRoot}/${item.filePath}`;
    let readablePath: string | null = null;
    // Track which stage we are in so a failure names it (decrypt vs network).
    let stage = 'decrypt';
    try {
      // Decrypt to a readable temp path (passthrough returns the same path).
      readablePath = await crypto.openFile(sealedPath);
      stage = 'upload';
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
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = `${stage}: ${msg} (${item.fileName})`;
      // Surface the reason in Metro/logcat to diagnose upload failures.
      // eslint-disable-next-line no-console
      console.warn(`[upload] failed ${item.filePath}:`, msg);
      this.setStatus(item, 'error');
      return false;
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
