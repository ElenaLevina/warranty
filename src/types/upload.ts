/**
 * Статус загрузки файла (UI-индикатор «облако»). Не входит в session.json —
 * хранится в индексе/сторе. В v1.0 (local-only) загрузка застаблена.
 */
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

/** Элемент очереди загрузки. */
export interface UploadQueueItem {
  /** Абсолютный путь файла на устройстве. */
  filePath: string;
  /** Номер кейса, к которому относится файл. */
  plateNumber: string;
  /** Имя файла внутри кейса. */
  fileName: string;
  status: UploadStatus;
  /** Кол-во попыток загрузки. */
  attempts: number;
  /** ISO-время постановки в очередь. */
  enqueuedAt: string;
}
