/**
 * FilesService — the ONLY write gate into a case folder.
 *
 * Case identity: a case is addressed by its `caseId` (= folder name), which is
 * `<plate>_<datetime>_<rand>`. This allows several cases for the SAME plate
 * (different warranty incidents on one car). `plate_number` stays inside
 * session.json. Every "Начать осмотр" creates a brand-new case.
 *
 * Invariants:
 *  - Any case mutation goes through here and is preceded by assertOpen().
 *  - Writing to a closed case is rejected and logged to tamper.log (CLAUDE.md §5.4).
 *  - Files are placed via CryptoService.sealFile (at-rest encryption).
 *  - Numbering: plate.jpg is always the first photo; photo_NNN.jpg and
 *    video_NNN.mp4 have independent counters starting at 001.
 */
import type { CaseFileEntry, OpenSessionSummary, SessionMeta } from '../../types';
import type { FileSystem } from './fileSystem';
import type { CryptoService } from '../crypto/cryptoService';
import { APP_CONFIG } from '../../config';
import { SessionClosedError } from './errors';

const READ_ONLY_MODE = 0o444;

export interface CreateCaseParams {
  plateNumber: string;
  mechanicId: string;
  /** Stable per-install device id (§8). Omitted when not available. */
  deviceId?: string;
  /** Временный путь снимка номера из камеры. */
  plateImageTmpPath: string;
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export class FilesService {
  constructor(
    private readonly fs: FileSystem,
    private readonly crypto: CryptoService,
    private readonly casesRoot: string,
    /** Инъекция времени для детерминированных тестов. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  // --- paths (keyed by caseId = folder name) ---
  private caseDir(caseId: string): string {
    return `${this.casesRoot}/${caseId}`;
  }
  private sessionPath(caseId: string): string {
    return `${this.caseDir(caseId)}/session.json`;
  }
  private tamperLogPath(): string {
    return `${this.casesRoot}/tamper.log`;
  }

  private isoNow(): string {
    return this.now().toISOString();
  }
  private clockTime(): string {
    // "HH:MM:SS" как в session.json.
    return this.now().toISOString().slice(11, 19);
  }

  /** Build a unique case id: `<plate>_<YYYYMMDD-HHMMSS>_<rand>`. */
  private makeCaseId(plate: string): string {
    const iso = this.isoNow();
    const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
    const rand = Math.random().toString(36).slice(2, 5);
    return `${plate}_${stamp}_${rand}`;
  }

  // --- reading ---
  async readSession(caseId: string): Promise<SessionMeta> {
    const raw = await this.fs.readFile(this.sessionPath(caseId));
    const json = await this.crypto.decryptText(raw);
    return JSON.parse(json) as SessionMeta;
  }

  private async writeSession(caseId: string, meta: SessionMeta): Promise<void> {
    const json = JSON.stringify(meta, null, 2);
    const sealed = await this.crypto.encryptText(json);
    await this.fs.writeFile(this.sessionPath(caseId), sealed);
  }

  /** Write gate: throws and logs if the case is not open. */
  private async assertOpen(caseId: string, action: string): Promise<SessionMeta> {
    const meta = await this.readSession(caseId);
    if (meta.status !== 'open') {
      await this.logTamper(caseId, action);
      throw new SessionClosedError(caseId, action);
    }
    return meta;
  }

  private async logTamper(caseId: string, action: string): Promise<void> {
    const line = `${this.isoNow()}\t${caseId}\t${action}\tattempt to modify closed case\n`;
    await this.fs.appendFile(this.tamperLogPath(), line);
  }

  private nextIndex(meta: SessionMeta, type: 'photo' | 'video'): number {
    const re = type === 'photo' ? /^photo_(\d+)\.jpg$/ : /^video_(\d+)\.mp4$/;
    let max = 0;
    for (const f of meta.files) {
      const m = re.exec(f.name);
      if (m && m[1] !== undefined) {
        max = Math.max(max, Number(m[1]));
      }
    }
    return max + 1;
  }

  // --- mutations ---

  /**
   * Create a brand-new case: folder `<plate>_<datetime>_<rand>`, plate.jpg,
   * session.json (status=open). Returns the meta (includes the generated case_id).
   */
  async createCase(params: CreateCaseParams): Promise<SessionMeta> {
    const { plateNumber, mechanicId, deviceId, plateImageTmpPath } = params;
    const caseId = this.makeCaseId(plateNumber);

    await this.fs.mkdir(this.caseDir(caseId));
    await this.crypto.sealFile(plateImageTmpPath, `${this.caseDir(caseId)}/plate.jpg`);

    const meta: SessionMeta = {
      case_id: caseId,
      plate_number: plateNumber,
      session_start: this.isoNow(),
      session_end: null,
      mechanic_id: mechanicId,
      // Omitted from JSON when undefined (e.g. in unit tests).
      ...(deviceId !== undefined ? { device_id: deviceId } : {}),
      files: [{ name: 'plate.jpg', type: 'photo', timestamp: this.clockTime() }],
      description: '',
      status: 'open',
    };
    await this.writeSession(caseId, meta);
    return meta;
  }

  async addPhoto(caseId: string, tmpPath: string): Promise<CaseFileEntry> {
    const meta = await this.assertOpen(caseId, 'addPhoto');
    const name = `photo_${pad3(this.nextIndex(meta, 'photo'))}.jpg`;
    await this.crypto.sealFile(tmpPath, `${this.caseDir(caseId)}/${name}`);
    const entry: CaseFileEntry = { name, type: 'photo', timestamp: this.clockTime() };
    meta.files.push(entry);
    await this.writeSession(caseId, meta);
    return entry;
  }

  async addVideo(caseId: string, tmpPath: string, durationSec: number): Promise<CaseFileEntry> {
    if (durationSec < 0 || durationSec > APP_CONFIG.maxVideoDurationSec) {
      throw new RangeError(
        `Длительность видео ${durationSec}с вне допустимого диапазона 0..${APP_CONFIG.maxVideoDurationSec}`,
      );
    }
    const meta = await this.assertOpen(caseId, 'addVideo');
    const name = `video_${pad3(this.nextIndex(meta, 'video'))}.mp4`;
    await this.crypto.sealFile(tmpPath, `${this.caseDir(caseId)}/${name}`);
    const entry: CaseFileEntry = {
      name,
      type: 'video',
      timestamp: this.clockTime(),
      duration_sec: Math.round(durationSec),
    };
    meta.files.push(entry);
    await this.writeSession(caseId, meta);
    return entry;
  }

  async setDescription(caseId: string, description: string): Promise<void> {
    const meta = await this.assertOpen(caseId, 'setDescription');
    meta.description = description;
    await this.writeSession(caseId, meta);
  }

  /** Close the case: status=closed, session_end=now, READ ONLY (chmod best-effort). */
  async closeCase(caseId: string): Promise<SessionMeta> {
    const meta = await this.assertOpen(caseId, 'closeCase');
    meta.status = 'closed';
    meta.session_end = this.isoNow();
    await this.writeSession(caseId, meta);

    // Defense-in-depth: drop the write bit on the case files (no-op on some FS).
    const dir = this.caseDir(caseId);
    const entries = await this.fs.readDir(dir);
    for (const e of entries) {
      if (e.isFile) {
        await this.fs.chmod(e.path, READ_ONLY_MODE);
      }
    }
    return meta;
  }

  /**
   * List open sessions. When `mechanicId` is provided, only sessions belonging
   * to that mechanic are returned (per-mechanic isolation, CLAUDE.md §8): a new
   * employee never sees the previous mechanic's cases.
   */
  async listOpenSessions(mechanicId?: string): Promise<OpenSessionSummary[]> {
    const rootExists = await this.fs.exists(this.casesRoot);
    if (!rootExists) {
      return [];
    }
    const dirs = await this.fs.readDir(this.casesRoot);
    const result: OpenSessionSummary[] = [];
    for (const d of dirs) {
      if (!d.isDirectory) {
        continue;
      }
      const sessionPath = `${d.path}/session.json`;
      if (!(await this.fs.exists(sessionPath))) {
        continue;
      }
      const meta = await this.readSession(d.name);
      const ownedByMechanic = mechanicId === undefined || meta.mechanic_id === mechanicId;
      if (meta.status === 'open' && ownedByMechanic) {
        result.push({
          case_id: meta.case_id,
          plate_number: meta.plate_number,
          session_start: meta.session_start,
          file_count: meta.files.length,
        });
      }
    }
    return result;
  }
}
