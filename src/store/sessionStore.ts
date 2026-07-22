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
  /** Set the optional diagcode (דיאקוד) text for the active case. */
  setDiagcode(text: string): Promise<void>;
  /** Set the card type (סוג כרטיס) — required before finish; sets the folder letter. */
  setOrderType(orderType: OrderType): Promise<void>;
  /** Save a marked-up photo OVER the original (open session only). */
  replacePhoto(fileName: string, tmpPath: string): Promise<void>;
  /** Delete a low-quality file from the active case (not the plate photo). */
  deleteFile(fileName: string): Promise<void>;
  finish(): Promise<void>;
  /** Retry the upload queue (called on network regained). */
  processUploads(): Promise<void>;
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
      // closeCase materialized diagcode.txt only when the field was non-empty.
      if (meta.diagcode !== undefined && meta.diagcode.trim().length > 0) {
        names.push('diagcode.txt');
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
      lastOcrText: '',

      async bootstrap() {
        await run(async () => {
          // Remove any leftover decrypted preview temp files (no-op for passthrough).
          await crypto.clearDecryptedCache?.();
          // Drop any session.json completion queued by an older build — the PC
          // no longer receives session.json, so it must never be flushed.
          for (const c of index.getPendingCompletes()) {
            index.removePendingComplete(c.caseId);
          }
          await refreshOpenSessions(set);
          refreshPending();
        });
        // Retry the upload queue in the BACKGROUND — never block the Start
        // screen. If the receiver is unreachable each item times out (bounded
        // in the transport) and stays queued for the next attempt. Reflect the
        // outcome in the pending counter so the Start badge stays accurate.
        void upload
          .processQueue()
          .then(() => refreshPending())
          .catch(() => undefined);
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

      async setDiagcode(text: string) {
        const active = get().active;
        if (active === null) {
          return;
        }
        await run(async () => {
          const meta = await files.setDiagcode(active.case_id, text);
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
            // Enqueue the whole case now (nothing was queued while the session
            // was open, so the PC folder is created only at finish).
            await enqueueClosedCase(closed);
            refreshPending(); // show "waiting to send" immediately
            // Upload the case MEDIA in the BACKGROUND — never block the UI/close.
            // Failures are retried by the queue (on reconnect / next start).
            // session.json is intentionally NOT sent: the PC operators don't want
            // it in the case folder. It stays on the phone as the source of truth.
            void upload
              .processQueue()
              .then(() => refreshPending())
              .catch(() => undefined);
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

      async processUploads() {
        await run(async () => {
          await upload.processQueue();
          syncUploads();
          refreshPending();
        });
      },

      leaveActive() {
        set({ active: null, uploads: {} });
      },
    };
  });
}
