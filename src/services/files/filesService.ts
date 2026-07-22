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
import type { CaseFileEntry, OpenSessionSummary, OrderType, SessionMeta } from '../../types';
import type { FileSystem } from './fileSystem';
import type { CryptoService } from '../crypto/cryptoService';
import { APP_CONFIG } from '../../config';
import { SessionClosedError } from './errors';

const READ_ONLY_MODE = 0o444;

export interface CreateCaseParams {
  plateNumber: string;
  /** 6-digit repair-order number (mandatory step before the plate scan). */
  orderNumber: string;
  mechanicId: string;
  /** Role of the user who opened the case (metadata). */
  mechanicRole?: 'admin' | 'mechanic';
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

  /** Folder-suffix letter for the card type: warranty -> w, recall -> r. */
  private typeLetter(type: OrderType): string {
    return type === 'recall' ? 'r' : 'w';
  }

  /**
   * Build the OPEN case id (folder name) `<plate>_<order>_<YYYYMMDD>`, made
   * unique against existing case folders. The card-type letter is appended
   * later, at finish (renameForType). Uniqueness of the base guarantees the
   * later `_<letter>` folder is free too (nothing else starts with the base),
   * so same-day repeats for the same plate+order get a `-2`, `-3` suffix.
   */
  private async makeBaseId(orderNumber: string, plate: string): Promise<string> {
    const date = this.isoNow().slice(0, 10).replace(/-/g, '');
    const base = `${plate}_${orderNumber}_${date}`;
    const dirs = await this.existingCaseDirNames();
    const free = (b: string): boolean => !dirs.some(d => d === b || d.startsWith(`${b}_`));
    if (free(base)) {
      return base;
    }
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}`;
      if (free(candidate)) {
        return candidate;
      }
    }
  }

  private async existingCaseDirNames(): Promise<string[]> {
    if (!(await this.fs.exists(this.casesRoot))) {
      return [];
    }
    const entries = await this.fs.readDir(this.casesRoot);
    return entries.filter(e => e.isDirectory).map(e => e.name);
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
    const { plateNumber, orderNumber, mechanicId, mechanicRole, deviceId, plateImageTmpPath } = params;
    const caseId = await this.makeBaseId(orderNumber, plateNumber);

    await this.fs.mkdir(this.caseDir(caseId));
    await this.crypto.sealFile(plateImageTmpPath, `${this.caseDir(caseId)}/plate.jpg`);

    const meta: SessionMeta = {
      case_id: caseId,
      plate_number: plateNumber,
      order_number: orderNumber,
      session_start: this.isoNow(),
      session_end: null,
      mechanic_id: mechanicId,
      // Omitted from JSON when undefined (e.g. in unit tests).
      ...(mechanicRole !== undefined ? { mechanic_role: mechanicRole } : {}),
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

  /**
   * Replace an existing photo in place (green-pencil markup saved OVER the
   * original — product decision; the original is not kept). Open sessions only:
   * the write gate applies like for any other mutation.
   */
  async replacePhoto(caseId: string, fileName: string, tmpPath: string): Promise<SessionMeta> {
    const meta = await this.assertOpen(caseId, 'replacePhoto');
    const entry = meta.files.find(f => f.name === fileName);
    if (entry === undefined || entry.type !== 'photo') {
      throw new Error(`No photo "${fileName}" in case ${caseId}`);
    }
    await this.crypto.sealFile(tmpPath, `${this.caseDir(caseId)}/${fileName}`);
    entry.timestamp = this.clockTime();
    await this.writeSession(caseId, meta);
    return meta;
  }

  async setDescription(caseId: string, description: string): Promise<void> {
    const meta = await this.assertOpen(caseId, 'setDescription');
    meta.description = description;
    await this.writeSession(caseId, meta);
  }

  /** Set the card type (סוג כרטיס). Folder is renamed later, at closeCase. */
  async setOrderType(caseId: string, orderType: OrderType): Promise<SessionMeta> {
    const meta = await this.assertOpen(caseId, 'setOrderType');
    meta.order_type = orderType;
    await this.writeSession(caseId, meta);
    return meta;
  }

  /** Move every file of a case folder to a new folder name, then drop the old dir. */
  private async renameCaseFolder(oldId: string, newId: string): Promise<void> {
    const oldDir = this.caseDir(oldId);
    const newDir = this.caseDir(newId);
    await this.fs.mkdir(newDir);
    const entries = await this.fs.readDir(oldDir);
    for (const e of entries) {
      if (e.isFile) {
        await this.fs.moveFile(e.path, `${newDir}/${e.name}`);
      }
    }
    await this.fs.unlink(oldDir).catch(() => undefined); // best-effort: remove empty dir
  }

  /**
   * Close the case: status=closed, session_end=now, and — once the card type is
   * known — rename the folder to `<base>_<w|r>`. Returns the meta with the final
   * case_id. READ ONLY (chmod best-effort) is applied to the final folder.
   */
  async closeCase(caseId: string): Promise<SessionMeta> {
    const meta = await this.assertOpen(caseId, 'closeCase');
    meta.status = 'closed';
    meta.session_end = this.isoNow();

    // Append the card-type letter to the folder name (rename), if chosen.
    if (meta.order_type !== undefined) {
      const finalId = `${caseId}_${this.typeLetter(meta.order_type)}`;
      await this.renameCaseFolder(caseId, finalId);
      meta.case_id = finalId;
    }
    const finalId = meta.case_id;
    await this.writeSession(finalId, meta);

    // Defense-in-depth: drop the write bit on the case files (no-op on some FS).
    const dir = this.caseDir(finalId);
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
          ...(meta.order_number !== undefined ? { order_number: meta.order_number } : {}),
          session_start: meta.session_start,
          file_count: meta.files.length,
        });
      }
    }
    return result;
  }
}
