# Архитектура — Warranty (итерация 1)

## Принцип

Всё, что требует реального устройства или бэкенда, спрятано **за интерфейсом сервиса**.
Срез использует mock/stub-реализации и запускается на эмуляторе; реальные реализации —
изолированные фазы (6, 7) на устройстве. Чистая бизнес-логика (парсер номеров, лайфцикл,
врата READ ONLY) — на TS, покрыта тестами без устройства.

## Слои

```
screens/         UI (React, функциональные компоненты + хуки)
  navigation/    @react-navigation stack, 4 экрана
store/           Zustand — проекция состояния для UI (НЕ источник правды)
services/        бизнес-логика и внешние зависимости за интерфейсами
  ocr/           OcrService (interface) + MockOcrService + plateParser (чистый TS)
  files/         FilesService — ЕДИНСТВЕННЫЕ врата записи в кейс (READ ONLY guard)
  storage/       StorageIndex (MMKV) — индекс открытых сессий и очереди загрузки
  crypto/        CryptoService (interface) + passthrough (реальный Keystore — Фаза 7)
  upload/        UploadService (stub в v1.0 local-only)
  notify/        NotifyService (stub в v1.0 local-only)
types/           доменные типы (Session, CaseFile, OcrResult, ...)
config/          конфиг приложения (mechanic_id, пороги)
```

## Источник правды

- **Файлы кейса на диске** (`/cases/<номер>/…`, включая `session.json`) — источник правды.
- **MMKV-индекс** — быстрый кэш: список открытых сессий, очередь загрузки. Производный,
  восстанавливается сканом диска.
- **Zustand store** — in-memory проекция для UI. Не персистентный источник.

## Лайфцикл сессии

```
[Старт] --«Начать осмотр»--> [Первое фото]
   ^                              |
   |                          снимок -> OcrService -> plateParser
   |                              |
   |                       confidence >= 85% ? --нет--> «Переснять»
   |                              | да
[Завершено] <--«ЗАКОНЧИЛ»-- [Активная сессия] --(FilesService.createCase, status=open)
```

Состояния: `open` -> `closed`. После `closed` папка READ ONLY.

## READ ONLY инвариант (app-level)

Любая запись идёт **только** через `FilesService`. Перед записью проверяется
`status === 'open'`; при `closed` — исключение + запись в `tamper.log`.
Дополнительно снимается write-бит (chmod) у файлов закрытого кейса.
Честно: это **app-level инвариант**, не гарантия ОС (приложение владеет своим sandbox).

## Карта интерфейсов сервисов

| Сервис | Интерфейс (срез) | Реальная реализация |
|---|---|---|
| OcrService | `recognizePlate(imagePath): Promise<OcrResult>` | ML Kit нативный мост (Фаза 6) |
| CryptoService | `encryptFile/decryptFile/getReadStream` | Android Keystore AES (Фаза 7) |
| FilesService | `createCase/addPhoto/addVideo/writeSession/closeCase` | то же (FS реальный) |
| StorageIndex | `listOpenSessions/enqueue/dequeue` | MMKV (реальный, зашифрованный ключ) |
| UploadService | `enqueue/processQueue` | stub (local-only v1.0) |
| NotifyService | `caseOpened/fileUploaded/caseClosed` | stub (local-only v1.0) |

## Карта экранов (Фаза 5)

`Start` → `PlateCapture` → `ActiveSession` → `SessionComplete` (см. CLAUDE.md §3).
