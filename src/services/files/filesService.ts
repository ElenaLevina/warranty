/**
 * FilesService — ЕДИНСТВЕННЫЕ врата записи в папку кейса.
 *
 * Инварианты:
 *  - Любая мутация кейса проходит здесь и предваряется assertOpen().
 *  - При записи в closed-кейс операция отклоняется и фиксируется в tamper.log
 *    (CLAUDE.md §5.4). Это app-level инвариант (приложение владеет своим sandbox).
 *  - Все файлы помещаются через CryptoService.sealFile (at-rest шифрование).
 *  - Нумерация: plate.jpg — всегда первое фото; photo_NNN.jpg и video_NNN.mp4 —
 *    раздельные счётчики с 001, по 3 цифры.
 */
import type { CaseFileEntry, OpenSessionSummary, SessionMeta } from '../../types';
import type { FileSystem } from './fileSystem';
import type { CryptoService } from '../crypto/cryptoService';
import { APP_CONFIG } from '../../config';
import { CaseAlreadyClosedError, SessionClosedError } from './errors';

const READ_ONLY_MODE = 0o444;

export interface CreateCaseParams {
  plateNumber: string;
  mechanicId: string;
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

  // --- пути ---
  private caseDir(plate: string): string {
    return `${this.casesRoot}/${plate}`;
  }
  private sessionPath(plate: string): string {
    return `${this.caseDir(plate)}/session.json`;
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

  // --- чтение ---
  async readSession(plate: string): Promise<SessionMeta> {
    const raw = await this.fs.readFile(this.sessionPath(plate));
    const json = await this.crypto.decryptText(raw);
    return JSON.parse(json) as SessionMeta;
  }

  private async writeSession(plate: string, meta: SessionMeta): Promise<void> {
    const json = JSON.stringify(meta, null, 2);
    const sealed = await this.crypto.encryptText(json);
    await this.fs.writeFile(this.sessionPath(plate), sealed);
  }

  /** Гейт записи: бросает и логирует, если кейс не open. */
  private async assertOpen(plate: string, action: string): Promise<SessionMeta> {
    const meta = await this.readSession(plate);
    if (meta.status !== 'open') {
      await this.logTamper(plate, action);
      throw new SessionClosedError(plate, action);
    }
    return meta;
  }

  private async logTamper(plate: string, action: string): Promise<void> {
    const line = `${this.isoNow()}\t${plate}\t${action}\tattempt to modify closed case\n`;
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

  // --- мутации ---

  /** Создать кейс: папка = номер, plate.jpg, session.json (status=open). */
  async createCase(params: CreateCaseParams): Promise<SessionMeta> {
    const { plateNumber, mechanicId, plateImageTmpPath } = params;
    const sessionExists = await this.fs.exists(this.sessionPath(plateNumber));
    if (sessionExists) {
      const existing = await this.readSession(plateNumber);
      if (existing.status === 'closed') {
        throw new CaseAlreadyClosedError(plateNumber);
      }
      return existing; // уже открыт — вернуть как есть (возврат в активную сессию)
    }

    await this.fs.mkdir(this.caseDir(plateNumber));
    await this.crypto.sealFile(plateImageTmpPath, `${this.caseDir(plateNumber)}/plate.jpg`);

    const meta: SessionMeta = {
      plate_number: plateNumber,
      session_start: this.isoNow(),
      session_end: null,
      mechanic_id: mechanicId,
      files: [{ name: 'plate.jpg', type: 'photo', timestamp: this.clockTime() }],
      description: '',
      status: 'open',
    };
    await this.writeSession(plateNumber, meta);
    return meta;
  }

  async addPhoto(plate: string, tmpPath: string): Promise<CaseFileEntry> {
    const meta = await this.assertOpen(plate, 'addPhoto');
    const name = `photo_${pad3(this.nextIndex(meta, 'photo'))}.jpg`;
    await this.crypto.sealFile(tmpPath, `${this.caseDir(plate)}/${name}`);
    const entry: CaseFileEntry = { name, type: 'photo', timestamp: this.clockTime() };
    meta.files.push(entry);
    await this.writeSession(plate, meta);
    return entry;
  }

  async addVideo(plate: string, tmpPath: string, durationSec: number): Promise<CaseFileEntry> {
    if (durationSec < 0 || durationSec > APP_CONFIG.maxVideoDurationSec) {
      throw new RangeError(
        `Длительность видео ${durationSec}с вне допустимого диапазона 0..${APP_CONFIG.maxVideoDurationSec}`,
      );
    }
    const meta = await this.assertOpen(plate, 'addVideo');
    const name = `video_${pad3(this.nextIndex(meta, 'video'))}.mp4`;
    await this.crypto.sealFile(tmpPath, `${this.caseDir(plate)}/${name}`);
    const entry: CaseFileEntry = {
      name,
      type: 'video',
      timestamp: this.clockTime(),
      duration_sec: Math.round(durationSec),
    };
    meta.files.push(entry);
    await this.writeSession(plate, meta);
    return entry;
  }

  async setDescription(plate: string, description: string): Promise<void> {
    const meta = await this.assertOpen(plate, 'setDescription');
    meta.description = description;
    await this.writeSession(plate, meta);
  }

  /** Завершить кейс: status=closed, session_end=now, READ ONLY (chmod best-effort). */
  async closeCase(plate: string): Promise<SessionMeta> {
    const meta = await this.assertOpen(plate, 'closeCase');
    meta.status = 'closed';
    meta.session_end = this.isoNow();
    await this.writeSession(plate, meta);

    // Defense-in-depth: снять write-бит у всех файлов кейса (no-op на части ФС).
    const dir = this.caseDir(plate);
    const entries = await this.fs.readDir(dir);
    for (const e of entries) {
      if (e.isFile) {
        await this.fs.chmod(e.path, READ_ONLY_MODE);
      }
    }
    return meta;
  }

  /** Список открытых сессий для стартового экрана. */
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
          plate_number: meta.plate_number,
          session_start: meta.session_start,
          file_count: meta.files.length,
        });
      }
    }
    return result;
  }
}
