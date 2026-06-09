/**
 * Session store (Zustand) — in-memory проекция состояния для UI.
 * НЕ источник правды: правда — файлы на диске (FilesService). После каждой
 * мутации store перечитывает session.json, чтобы исключить дрейф.
 *
 * Реализован как фабрика над zustand/vanilla для юнит-тестов без React.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppServices } from '../services/container';
import type { OpenSessionSummary, PlateResult, SessionMeta, UploadStatus } from '../types';
import { pickPlate } from '../services/ocr/plateParser';

export interface SessionState {
  phase: 'idle' | 'busy';
  error: string | null;
  openSessions: OpenSessionSummary[];
  active: SessionMeta | null;
  /** Статус загрузки по имени файла активной сессии. */
  uploads: Record<string, UploadStatus>;
  /** Raw text seen by OCR on the last recognize attempt (diagnostics). */
  lastOcrText: string;

  bootstrap(): Promise<void>;
  recognizePlate(imagePath: string): Promise<PlateResult>;
  startCase(plateNumber: string, plateImageTmpPath: string): Promise<void>;
  resume(plateNumber: string): Promise<void>;
  addPhoto(tmpPath: string): Promise<void>;
  addVideo(tmpPath: string, durationSec: number): Promise<void>;
  setDescription(text: string): Promise<void>;
  finish(): Promise<void>;
  leaveActive(): void;
}

export type SessionStore = StoreApi<SessionState>;

export function createSessionStore(services: AppServices): SessionStore {
  const { files, index, upload, notify, ocr, auth, device, crypto, config } = services;

  /** Current mechanic id; throws if the app is not unlocked. */
  function requireMechanicId(): string {
    const identity = auth.current();
    if (identity === null) {
      throw new Error('Нет авторизованного механика');
    }
    return identity.mechanicId;
  }

  async function refreshOpenSessions(set: (p: Partial<SessionState>) => void): Promise<void> {
    // Isolation: only the current mechanic's open sessions are listed (§8).
    const open = await files.listOpenSessions(auth.current()?.mechanicId);
    index.setOpenSessions(open);
    set({ openSessions: open });
  }

  function uploadsFromMeta(meta: SessionMeta, prev: Record<string, UploadStatus>): Record<string, UploadStatus> {
    const next: Record<string, UploadStatus> = {};
    for (const f of meta.files) {
      next[f.name] = prev[f.name] ?? 'pending';
    }
    return next;
  }

  return createStore<SessionState>((set, get) => {
    /** Обёртка: единая обработка busy/error для действий-мутаций. */
    async function run<T>(fn: () => Promise<T>): Promise<T> {
      set({ phase: 'busy', error: null });
      try {
        const r = await fn();
        set({ phase: 'idle' });
        return r;
      } catch (e) {
        set({ phase: 'idle', error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    }

    async function reloadActive(plate: string): Promise<void> {
      const meta = await files.readSession(plate);
      set({ active: meta, uploads: uploadsFromMeta(meta, get().uploads) });
    }

    async function enqueueLatest(plate: string, fileName: string): Promise<void> {
      await upload.enqueue({
        filePath: `${plate}/${fileName}`,
        plateNumber: plate,
        fileName,
        status: 'pending',
        attempts: 0,
        enqueuedAt: new Date().toISOString(),
      });
      set({ uploads: { ...get().uploads, [fileName]: 'pending' } });
    }

    return {
      phase: 'idle',
      error: null,
      openSessions: [],
      active: null,
      uploads: {},
      lastOcrText: '',

      async bootstrap() {
        await run(async () => {
          // Remove any leftover decrypted preview temp files (no-op for passthrough).
          await crypto.clearDecryptedCache?.();
          await refreshOpenSessions(set);
          await upload.processQueue();
        });
      },

      async recognizePlate(imagePath: string) {
        return run(async () => {
          const raw = await ocr.recognize(imagePath);
          // Stash what OCR saw so the UI can show it on failure (diagnostics).
          set({
            lastOcrText: raw.candidates
              .map(c => `${c.text} (${Math.round(c.confidence * 100)}%)`)
              .join(' | '),
          });
          return pickPlate(raw.candidates, config.ocrConfidenceThreshold);
        });
      },

      async startCase(plateNumber: string, plateImageTmpPath: string) {
        await run(async () => {
          const meta = await files.createCase({
            plateNumber,
            mechanicId: requireMechanicId(),
            deviceId: device.getDeviceId(),
            plateImageTmpPath,
          });
          set({ active: meta, uploads: uploadsFromMeta(meta, {}) });
          await enqueueLatest(plateNumber, 'plate.jpg');
          notify.emit({ kind: 'caseOpened', plate: plateNumber });
          await refreshOpenSessions(set);
        });
      },

      async resume(plateNumber: string) {
        await run(async () => {
          await reloadActive(plateNumber);
        });
      },

      async addPhoto(tmpPath: string) {
        const plate = get().active?.plate_number;
        if (plate === undefined) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          const entry = await files.addPhoto(plate, tmpPath);
          await reloadActive(plate);
          await enqueueLatest(plate, entry.name);
        });
      },

      async addVideo(tmpPath: string, durationSec: number) {
        const plate = get().active?.plate_number;
        if (plate === undefined) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          const entry = await files.addVideo(plate, tmpPath, durationSec);
          await reloadActive(plate);
          await enqueueLatest(plate, entry.name);
        });
      },

      async setDescription(text: string) {
        const plate = get().active?.plate_number;
        if (plate === undefined) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          await files.setDescription(plate, text);
          await reloadActive(plate);
        });
      },

      async finish() {
        const plate = get().active?.plate_number;
        if (plate === undefined) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          const closed = await files.closeCase(plate);
          notify.emit({ kind: 'caseClosed', plate, fileCount: closed.files.length });
          set({ active: null, uploads: {} });
          await refreshOpenSessions(set);
        });
      },

      leaveActive() {
        set({ active: null, uploads: {} });
      },
    };
  });
}
