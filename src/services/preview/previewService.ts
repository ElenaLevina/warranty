/**
 * PreviewService — small unencrypted thumbnails for the session grid, and
 * temporary readable (decrypted) copies for the full-screen viewer.
 *
 * Security model (CLAUDE.md §8): case media stays encrypted at rest. Previews
 * are small (~300px) low-detail JPEGs kept in the app-private cache dir only
 * while the session is open; clearCase() removes them when the case closes.
 * Full-size decrypted copies exist only while the viewer is open and are
 * deleted by releaseReadable().
 *
 * Thumbnail generation itself is native (image resizer / video frame grab) and
 * is injected as a Thumbnailer port so tests and the emulator run without it
 * (grid falls back to icons when getPreview returns null).
 */
import type { FileSystem } from '../files/fileSystem';
import type { CryptoService } from '../crypto/cryptoService';
import type { CaseFileEntry } from '../../types';

export interface Thumbnailer {
  /** Downscale a readable photo into destPath (~300px JPEG). */
  photoThumb(readablePath: string, destPath: string): Promise<void>;
  /** Grab a frame from a readable video into destPath (JPEG). */
  videoThumb(readablePath: string, destPath: string): Promise<void>;
}

export interface PreviewService {
  /** Thumbnail path for a case file, or null when unavailable (fallback icon). */
  getPreview(caseId: string, entry: CaseFileEntry): Promise<string | null>;
  /** Decrypted, readable path to the full file (for the viewer). */
  getReadable(caseId: string, fileName: string): Promise<string>;
  /** Delete a decrypted copy produced by getReadable (no-op for passthrough). */
  releaseReadable(caseId: string, fileName: string, readablePath: string): Promise<void>;
  /** Drop a single cached thumbnail (after the photo was redrawn/replaced). */
  invalidate(caseId: string, fileName: string): Promise<void>;
  /**
   * Generate a thumbnail directly from an already-readable (plaintext) file —
   * the fresh camera capture, BEFORE it is encrypted. Called at capture time so
   * the grid shows cached thumbnails instantly (no decrypt, no on-view work).
   * Best-effort: failures are swallowed (getPreview regenerates on demand).
   */
  warm(caseId: string, entry: CaseFileEntry, readablePath: string): Promise<void>;
  /** Remove all cached thumbnails of a case (called when the case closes). */
  clearCase(caseId: string): Promise<void>;
}

export class CachedPreviewService implements PreviewService {
  /** In-flight generation guards so parallel tiles don't render twice. */
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly fs: FileSystem,
    private readonly crypto: CryptoService,
    private readonly casesRoot: string,
    /** App-private cache dir for thumbnails (created lazily). */
    private readonly cacheDir: string,
    private readonly thumbnailer: Thumbnailer | null,
  ) {}

  private sealedPath(caseId: string, fileName: string): string {
    return `${this.casesRoot}/${caseId}/${fileName}`;
  }

  private thumbPath(caseId: string, fileName: string): string {
    // Flat cache: `<caseId>__<fileName>.thumb.jpg` (folder-safe, easy to sweep).
    return `${this.cacheDir}/${caseId}__${fileName}.thumb.jpg`;
  }

  async getPreview(caseId: string, entry: CaseFileEntry): Promise<string | null> {
    if (this.thumbnailer === null) {
      return null; // emulator/tests: no native thumbnailer -> icon fallback
    }
    const key = `${caseId}/${entry.name}`;
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const job = this.generate(caseId, entry).catch(() => null);
    this.inFlight.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async generate(caseId: string, entry: CaseFileEntry): Promise<string | null> {
    const thumb = this.thumbPath(caseId, entry.name);
    if (await this.fs.exists(thumb)) {
      return thumb;
    }
    await this.fs.mkdir(this.cacheDir).catch(() => undefined);
    const sealed = this.sealedPath(caseId, entry.name);
    const readable = await this.crypto.openFile(sealed);
    try {
      if (entry.type === 'video') {
        await this.thumbnailer!.videoThumb(readable, thumb);
      } else {
        await this.thumbnailer!.photoThumb(readable, thumb);
      }
    } finally {
      // Remove the decrypted full-size copy right after thumbnailing.
      if (readable !== sealed) {
        await this.fs.unlink(readable).catch(() => undefined);
      }
    }
    return (await this.fs.exists(thumb)) ? thumb : null;
  }

  async warm(caseId: string, entry: CaseFileEntry, readablePath: string): Promise<void> {
    if (this.thumbnailer === null) {
      return;
    }
    try {
      await this.fs.mkdir(this.cacheDir).catch(() => undefined);
      const thumb = this.thumbPath(caseId, entry.name);
      if (entry.type === 'video') {
        await this.thumbnailer.videoThumb(readablePath, thumb);
      } else {
        await this.thumbnailer.photoThumb(readablePath, thumb);
      }
    } catch {
      // best-effort: getPreview will regenerate from the sealed file later
    }
  }

  async getReadable(caseId: string, fileName: string): Promise<string> {
    return this.crypto.openFile(this.sealedPath(caseId, fileName));
  }

  async releaseReadable(caseId: string, fileName: string, readablePath: string): Promise<void> {
    if (readablePath !== this.sealedPath(caseId, fileName)) {
      await this.fs.unlink(readablePath).catch(() => undefined);
    }
  }

  async invalidate(caseId: string, fileName: string): Promise<void> {
    await this.fs.unlink(this.thumbPath(caseId, fileName)).catch(() => undefined);
  }

  async clearCase(caseId: string): Promise<void> {
    const exists = await this.fs.exists(this.cacheDir);
    if (!exists) {
      return;
    }
    const entries = await this.fs.readDir(this.cacheDir);
    for (const e of entries) {
      if (e.isFile && e.name.startsWith(`${caseId}__`)) {
        await this.fs.unlink(e.path).catch(() => undefined);
      }
    }
  }
}
