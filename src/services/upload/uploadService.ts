/**
 * UploadService — граница загрузки на бэкенд. В v1.0 (local-only) реального
 * сервера нет, поэтому StubUploadService ничего не отправляет: файлы остаются
 * в очереди со статусом 'pending' (UI показывает «Ожидает загрузки»).
 * Реальный клиент подключается к этому же интерфейсу при появлении API.
 */
import type { StorageIndex } from '../storage/storageIndex';
import type { UploadQueueItem } from '../../types';

export interface UploadService {
  /** Поставить файл в очередь и попытаться загрузить (если есть сеть/сервер). */
  enqueue(item: UploadQueueItem): Promise<void>;
  /** Догрузить всю очередь (вызывается при восстановлении сети/старте). */
  processQueue(): Promise<void>;
}

export class StubUploadService implements UploadService {
  constructor(private readonly index: StorageIndex) {}

  async enqueue(item: UploadQueueItem): Promise<void> {
    // local-only: фиксируем в очереди, реальной отправки нет.
    this.index.enqueueUpload({ ...item, status: 'pending' });
  }

  async processQueue(): Promise<void> {
    // local-only: no-op. Здесь будет цикл отправки при подключении бэкенда.
  }
}
