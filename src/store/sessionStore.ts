/**
 * Session store (Zustand) — in-memory проекция состояния для UI.
 * НЕ источник правды: правда — файлы на диске (FilesService). После каждой
 * мутации store перечитывает session.json, чтобы исключить дрейф.
 *
 * Реализован как фабрика над zustand/vanilla для юнит-тестов без React.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppServices } from '../services/container';
import type {
  CaseListItem,
  OpenSessionSummary,
  OrderNumberResult,
  OrderType,
  PlateResult,
  SessionMeta,
  UploadStatus,
} from '../types';
import { RECOMMENDATION_FILE } from '../services/files/filesService';
import { pickPlate } from '../services/ocr/plateParser';
import { pickOrderNumber } from '../services/ocr/orderNumberParser';

export interface SessionState {
  phase: 'idle' | 'busy';
  error: string | null;
  openSessions: OpenSessionSummary[];
  active: SessionMeta | null;
  /** Статус загрузки по имени файла активной сессии. */
  uploads: Record<string, UploadStatus>;
  /** Count of queued files not yet delivered to the PC (0 = all sent / nothing queued). */
  pendingUploads: number;
  /** True while a manual "Send to PC" pass is running (drives the UI indicator). */
  uploading: boolean;
  /** Reason of the last failed manual send (shown on Start for diagnosis), or ''. */
  uploadError: string;
  /** Raw text seen by OCR on the last recognize attempt (diagnostics). */
  lastOcrText: string;

  bootstrap(): Promise<void>;
  recognizePlate(imagePath: string): Promise<PlateResult>;
  /** Scan the work-order form: OCR + parse; the photo is deleted afterwards. */
  recognizeOrder(imagePath: string): Promise<OrderNumberResult>;
  /** Create a new case for the plate. Returns the generated case_id. */
  startCase(plateNumber: string, plateImageTmpPath: string, orderNumber: string): Promise<string>;
  resume(caseId: string): Promise<void>;
  addPhoto(tmpPath: string): Promise<void>;
  addVideo(tmpPath: string, durationSec: number): Promise<void>;
  setDescription(text: string): Promise<void>;
  /** Set the optional recommendation (המלצה) flag for the active case. */
  setRecommendation(on: boolean): Promise<void>;
  /** Set the card type (סוג כרטיס) — required before finish; sets the folder letter. */
  setOrderType(orderType: OrderType): Promise<void>;
  /** Save a marked-up photo OVER the original (open session only). */
  replacePhoto(fileName: string, tmpPath: string): Promise<void>;
  /** Delete a low-quality file from the active case (not the plate photo). */
  deleteFile(fileName: string): Promise<void>;
  /** Discard the ENTIRE active (open) session — e.g. wrong car for this order. */
  deleteActiveSession(): Promise<void>;
  finish(): Promise<void>;
  /** Manually send the queued files to the PC (the only upload trigger now). */
  sendToPc(): Promise<void>;
  /** Re-send EVERY case on this phone to the PC (recovery). Returns case count. */
  resendAllCases(): Promise<number>;
  /** List every case on the phone (open+closed) for the recovery/re-send screen. */
  listResendCases(): Promise<CaseListItem[]>;
  /** Re-send ONE case to the PC (recovery of a single overwritten case). */
  resendCase(caseId: string): Promise<void>;
  leaveActive(): void;
}

export type SessionStore = StoreApi<SessionState>;

export function createSessionStore(services: AppServices): SessionStore {
  const { files, index, upload, notify, ocr, auth, device, crypto, config, preview } = services;

  // Guard against a second "ЗАКОНЧИЛ" while the first finish is still running
  // (closeCase happens up front, but uploads afterwards can be slow).
  let finishing = false;

  /** Current user id (used as mechanic_id); throws if the app is not unlocked. */
  function requireMechanicId(): string {
    const user = auth.current();
    if (user === null) {
      throw new Error('No authenticated user');
    }
    return user.id;
  }

  async function refreshOpenSessions(set: (p: Partial<SessionState>) => void): Promise<void> {
    // Isolation: only the current user's open sessions are listed (§8).
    const open = await files.listOpenSessions(auth.current()?.id);
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

    /**
     * Enqueue EVERY file of a (just-closed) case for upload. Nothing is queued
     * while the session is open, so the PC folder is created only at finish —
     * an open/abandoned session never reaches the PC (service-center request).
     */
    async function enqueueClosedCase(meta: SessionMeta): Promise<void> {
      const names = meta.files.map(f => f.name);
      // closeCase materialized recommendation.txt only when the flag was on.
      if (meta.recommendation === true) {
        names.push(RECOMMENDATION_FILE);
      }
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        await upload.enqueue({
          filePath: `${meta.case_id}/${name}`,
          plateNumber: meta.plate_number,
          fileName: name,
          status: 'pending',
          attempts: 0,
          enqueuedAt: new Date().toISOString(),
        });
      }
    }

    /** Recompute how many queued files still need to reach the PC. */
    function refreshPending(): void {
      set({ pendingUploads: index.getQueue().filter(i => i.status !== 'uploaded').length });
    }

    /** Refresh the active case's upload badges from the queue index. */
    function syncUploads(): void {
      const active = get().active;
      if (active === null) {
        return;
      }
      const queue = index.getQueue();
      const next: Record<string, UploadStatus> = { ...get().uploads };
      for (const f of active.files) {
        const q = queue.find(i => i.filePath === `${active.case_id}/${f.name}`);
        if (q !== undefined) {
          next[f.name] = q.status;
        }
      }
      set({ uploads: next });
    }

    return {
      phase: 'idle',
      error: null,
      openSessions: [],
      active: null,
      uploads: {},
      pendingUploads: 0,
      uploading: false,
      uploadError: '',
      lastOcrText: '',

      async bootstrap() {
        await run(async () => {
          // Housekeeping must NEVER prevent the session list from loading: the
          // mechanic has to reach open sessions even if a cleanup step fails.
          try {
            // Remove leftover decrypted preview temp files (no-op for passthrough).
            await crypto.clearDecryptedCache?.();
            // Drop any session.json completion queued by an older build — the PC
            // no longer receives session.json, so it must never be flushed.
            for (const c of index.getPendingCompletes()) {
              index.removePendingComplete(c.caseId);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[bootstrap] housekeeping failed:', e instanceof Error ? e.message : e);
          }
          await refreshOpenSessions(set);
          refreshPending();
        });
        // NO automatic upload on start. Uploads happen ONLY when the mechanic
        // taps "Send to PC" (manual, with an on-screen indicator) — background
        // passes on every reconnect competed with the camera/OCR and confused
        // users when the connection test disagreed with an in-flight transfer.
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

      async recognizeOrder(imagePath: string) {
        return run(async () => {
          const raw = await ocr.recognize(imagePath);
          set({
            lastOcrText: raw.candidates
              .map(c => `${c.text} (${Math.round(c.confidence * 100)}%)`)
              .join(' | '),
          });
          // The work-order photo is NOT part of the case: delete it right away.
          await services.fs.unlink(imagePath).catch(() => undefined);
          return pickOrderNumber(raw.candidates, config.ocrConfidenceThreshold);
        });
      },

      async startCase(plateNumber: string, plateImageTmpPath: string, orderNumber: string) {
        return run(async () => {
          const mechanicId = requireMechanicId();
          const meta = await files.createCase({
            plateNumber,
            orderNumber,
            mechanicId,
            mechanicRole: auth.current()?.role,
            deviceId: device.getDeviceId(),
            plateImageTmpPath,
          });
          const plateEntry = meta.files.find(f => f.name === 'plate.jpg');
          if (plateEntry !== undefined) {
            await preview.warm(meta.case_id, plateEntry, plateImageTmpPath);
          }
          set({ active: meta, uploads: uploadsFromMeta(meta, {}) });
          notify.emit({ kind: 'caseOpened', plate: meta.plate_number });
          await refreshOpenSessions(set);
          return meta.case_id;
        });
      },

      async resume(caseId: string) {
        await run(async () => {
          await reloadActive(caseId);
        });
      },

      async addPhoto(tmpPath: string) {
        const active = get().active;
        if (active === null) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          const entry = await files.addPhoto(active.case_id, tmpPath);
          // Build the thumbnail NOW from the plaintext capture (no decrypt) so
          // the grid shows it instantly instead of generating on view.
          await preview.warm(active.case_id, entry, tmpPath);
          await reloadActive(active.case_id);
        });
      },

      async addVideo(tmpPath: string, durationSec: number) {
        const active = get().active;
        if (active === null) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          const entry = await files.addVideo(active.case_id, tmpPath, durationSec);
          await preview.warm(active.case_id, entry, tmpPath);
          await reloadActive(active.case_id);
        });
      },

      async setDescription(text: string) {
        const active = get().active;
        if (active === null) {
          throw new Error('Нет активной сессии');
        }
        await run(async () => {
          await files.setDescription(active.case_id, text);
          await reloadActive(active.case_id);
        });
      },

      async setRecommendation(on: boolean) {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const meta = await files.setRecommendation(active.case_id, on);
          set({ active: meta });
        });
      },

      async setOrderType(orderType) {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const meta = await files.setOrderType(active.case_id, orderType);
          set({ active: meta });
        });
      },

      async replacePhoto(fileName: string, tmpPath: string) {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const meta = await files.replacePhoto(active.case_id, fileName, tmpPath);
          // No queue re-arm needed: nothing is uploaded during an open session;
          // the whole case is enqueued at finish (including this marked-up photo).
          // Regenerate the thumbnail from the marked-up plaintext file (fast, no
          // decrypt) BEFORE the grid re-renders, so it never shows a blank tile.
          const entry = meta.files.find(f => f.name === fileName);
          if (entry !== undefined) {
            await preview.warm(meta.case_id, entry, tmpPath);
          }
          set({ active: meta, uploads: { ...get().uploads, [fileName]: 'pending' } });
        });
      },

      async deleteFile(fileName: string) {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const meta = await files.deleteFile(active.case_id, fileName);
          // Drop it from the upload queue (never send a discarded file) and
          // remove its cached thumbnail.
          index.removeFromQueue(`${active.case_id}/${fileName}`);
          await preview.invalidate(active.case_id, fileName).catch(() => undefined);
          const nextUploads = { ...get().uploads };
          delete nextUploads[fileName];
          set({ active: meta, uploads: nextUploads });
        });
      },

      async deleteActiveSession() {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const caseId = active.case_id;
          await files.deleteCase(caseId);
          await preview.clearCase(caseId).catch(() => undefined);
          set({ active: null, uploads: {} });
          await refreshOpenSessions(set);
          refreshPending();
        });
      },

      async finish() {
        const active = get().active;
        // Idempotent: ignore repeat taps / no active session (avoids closing twice).
        if (active === null || finishing) {
          return;
        }
        // The card type (סוג כרטיס) is mandatory before a case can be closed;
        // it also decides the folder-name letter. UI disables the button too.
        if (active.order_type === undefined) {
          set({ error: 'session.orderTypeRequired' });
          return;
        }
        finishing = true;
        try {
          await run(async () => {
            const openId = active.case_id;
            const closed = await files.closeCase(openId);
            // The folder may have been renamed (…_w/_r); drop stale thumbnails
            // of the old id. Files are enqueued below under the FINAL case id.
            if (closed.case_id !== openId) {
              await preview.clearCase(openId).catch(() => undefined);
            }
            notify.emit({
              kind: 'caseClosed',
              plate: active.plate_number,
              fileCount: closed.files.length,
            });
            set({ active: null, uploads: {} });
            await refreshOpenSessions(set);
            // Thumbnails of a closed case are no longer needed (READ ONLY).
            await preview.clearCase(closed.case_id).catch(() => undefined);
            // Enqueue the whole case for LATER manual upload. Nothing is sent
            // now — the mechanic sends everything from Start via "Send to PC".
            // (session.json is intentionally never sent to the PC.)
            await enqueueClosedCase(closed);
            refreshPending();
          });
        } finally {
          finishing = false;
        }
      },

      async resendAllCases() {
        return run(async () => {
          const caseIds = await files.listAllCaseIds();
          for (const caseId of caseIds) {
            const meta = await files.readSession(caseId);
            for (const f of meta.files) {
              const filePath = `${caseId}/${f.name}`;
              await upload.enqueue({
                filePath,
                plateNumber: meta.plate_number,
                fileName: f.name,
                status: 'pending',
                attempts: 0,
                enqueuedAt: new Date().toISOString(),
              });
              // Re-arm already-uploaded items so processQueue re-sends them.
              index.updateUploadStatus(filePath, 'pending');
            }
          }
          await upload.processQueue();
          refreshPending();
          // session.json is intentionally not sent to the PC (media only).
          return caseIds.length;
        });
      },

      async listResendCases() {
        return run(async () => files.listAllCases());
      },

      async resendCase(caseId: string) {
        await run(async () => {
          const meta = await files.readSession(caseId);
          for (const f of meta.files) {
            const filePath = `${caseId}/${f.name}`;
            await upload.enqueue({
              filePath,
              plateNumber: meta.plate_number,
              fileName: f.name,
              status: 'pending',
              attempts: 0,
              enqueuedAt: new Date().toISOString(),
            });
            index.updateUploadStatus(filePath, 'pending'); // re-arm if already uploaded
          }
          await upload.processQueue();
          refreshPending();
          // session.json is intentionally not sent to the PC (media only).
        });
      },

      async sendToPc() {
        if (get().uploading) {
          return; // a send is already running
        }
        set({ uploading: true, uploadError: '' });
        try {
          await upload.processQueue();
        } catch (e) {
          set({ uploadError: e instanceof Error ? e.message : String(e) });
        } finally {
          syncUploads();
          refreshPending();
          // Surface the transport's reason for the first failed file (if any).
          set({ uploading: false, uploadError: upload.lastUploadError?.() ?? get().uploadError });
        }
      },

      leaveActive() {
        set({ active: null, uploads: {} });
      },
    };
  });
}
