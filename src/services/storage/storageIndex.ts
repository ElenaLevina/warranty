/**
 * StorageIndex — быстрый производный индекс поверх MMKV: список открытых сессий
 * и очередь загрузки. Источник правды остаётся на диске (session.json);
 * индекс восстановим сканом. MMKV создаётся с ключом шифрования (CLAUDE.md §8).
 */
import { MMKV } from 'react-native-mmkv';
import type { OpenSessionSummary, UploadQueueItem, UploadStatus } from '../../types';

const KEY_OPEN_SESSIONS = 'open_sessions';
const KEY_UPLOAD_QUEUE = 'upload_queue';

export interface StorageIndex {
  setOpenSessions(list: OpenSessionSummary[]): void;
  getOpenSessions(): OpenSessionSummary[];
  enqueueUpload(item: UploadQueueItem): void;
  removeFromQueue(filePath: string): void;
  updateUploadStatus(filePath: string, status: UploadStatus): void;
  getQueue(): UploadQueueItem[];
  clear(): void;
}

export class MmkvStorageIndex implements StorageIndex {
  private readonly mmkv: MMKV;

  constructor(encryptionKey?: string) {
    this.mmkv = new MMKV({
      id: 'warranty-index',
      ...(encryptionKey ? { encryptionKey } : {}),
    });
  }

  private readJson<T>(key: string, fallback: T): T {
    const raw = this.mmkv.getString(key);
    if (raw === undefined) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(key: string, value: unknown): void {
    this.mmkv.set(key, JSON.stringify(value));
  }

  setOpenSessions(list: OpenSessionSummary[]): void {
    this.writeJson(KEY_OPEN_SESSIONS, list);
  }

  getOpenSessions(): OpenSessionSummary[] {
    return this.readJson<OpenSessionSummary[]>(KEY_OPEN_SESSIONS, []);
  }

  enqueueUpload(item: UploadQueueItem): void {
    const queue = this.getQueue();
    if (queue.some(q => q.filePath === item.filePath)) {
      return; // идемпотентность
    }
    queue.push(item);
    this.writeJson(KEY_UPLOAD_QUEUE, queue);
  }

  removeFromQueue(filePath: string): void {
    const queue = this.getQueue().filter(q => q.filePath !== filePath);
    this.writeJson(KEY_UPLOAD_QUEUE, queue);
  }

  updateUploadStatus(filePath: string, status: UploadStatus): void {
    const queue = this.getQueue().map(q =>
      q.filePath === filePath ? { ...q, status } : q,
    );
    this.writeJson(KEY_UPLOAD_QUEUE, queue);
  }

  getQueue(): UploadQueueItem[] {
    return this.readJson<UploadQueueItem[]>(KEY_UPLOAD_QUEUE, []);
  }

  clear(): void {
    this.mmkv.delete(KEY_OPEN_SESSIONS);
    this.mmkv.delete(KEY_UPLOAD_QUEUE);
  }
}
