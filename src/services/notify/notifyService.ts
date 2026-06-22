/**
 * NotifyService — уведомления механику (ТЗ §7). В срезе — стаб, который
 * прокидывает события в sink (тосты в UI / лог в тестах). Авто-уведомление
 * станции сервис-консультанта в v1.0 (local-only) — лишь логируется.
 * Messages are localized via i18next (global instance).
 */
import i18n from '../../i18n';

export type NotifyEvent =
  | { kind: 'caseOpened'; plate: string }
  | { kind: 'fileUploaded'; plate: string }
  | { kind: 'uploadError'; plate: string }
  | { kind: 'caseClosed'; plate: string; fileCount: number };

export interface NotifyService {
  emit(event: NotifyEvent): void;
}

export type NotifySink = (message: string, event: NotifyEvent) => void;

function messageFor(event: NotifyEvent): string {
  switch (event.kind) {
    case 'caseOpened':
      return i18n.t('notify.caseOpened', { plate: event.plate });
    case 'fileUploaded':
      return ''; // тихое обновление счётчика
    case 'uploadError':
      return i18n.t('notify.uploadError');
    case 'caseClosed':
      return i18n.t('notify.caseClosed', { count: event.fileCount });
  }
}

export class StubNotifyService implements NotifyService {
  constructor(private readonly sink: NotifySink) {}

  emit(event: NotifyEvent): void {
    this.sink(messageFor(event), event);
  }
}
