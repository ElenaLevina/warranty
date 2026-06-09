# Нативные модули — Фазы 6 и 7 (сборка на устройстве)

> Эти модули написаны как **скелеты** и НЕ собирались в среде без Android SDK.
> Компилировать и проверять — на машине с Android SDK и физическом телефоне
> (камера/OCR на эмуляторе не тестируются — см. `SETUP.md`).

## Что добавлено

| Часть | Файлы |
|---|---|
| OCR (Фаза 6) | `android/app/src/main/java/com/warranty/ocr/OcrModule.kt`, `OcrPackage.kt` |
| Crypto (Фаза 7) | `android/app/src/main/java/com/warranty/crypto/CryptoModule.kt`, `CryptoPackage.kt` |
| Регистрация | `MainApplication.kt` → `add(OcrPackage())`, `add(CryptoPackage())` |
| Gradle | `android/app/build.gradle` → `com.google.mlkit:text-recognition:16.0.1` |
| JS-мост OCR | `src/services/ocr/ocrService.ts` → `MlKitOcrService` (модуль `WarrantyOcr`) |
| JS-мост Crypto | `src/services/crypto/keystoreCryptoService.ts` (модуль `WarrantyCrypto`) |
| Переключатель | `src/app/createAppServices.ts` → `USE_NATIVE_MODULES` |

## Как включить нативные реализации

1. Собрать на устройстве: `npx react-native run-android` (нужен Android SDK, NDK/CMake, телефон).
2. В `src/app/createAppServices.ts` установить `USE_NATIVE_MODULES = true`.
3. Тогда `OcrService` → `MlKitOcrService`, `CryptoService` → `KeystoreCryptoService`
   (подменяются через `NativeOverrides` в composition root, без изменений в UI/сторе).

## Контракты модулей

### WarrantyOcr
`recognize(imagePath: string): Promise<{ candidates: { text: string; confidence: number }[] }>`
- Latin Text Recognition v2, on-device.
- Выбор/форматирование номера остаётся в чистом TS `pickPlate` (`plateParser`).

### WarrantyCrypto (AES-256-GCM, Android Keystore)
- `encryptText/decryptText(string): Promise<string>` (base64 `[IV][ciphertext+tag]`).
- `sealFile(src, dest): Promise<void>` — шифрует файл at-rest.
- `openFile(src): Promise<string>` — расшифровывает во временный путь (cacheDir).

## Открытые задачи перед продакшеном (TODO в коде)

- **R3 (confidence ML Kit):** Latin-распознаватель часто отдаёт `NaN` для per-line
  confidence — сейчас подставляется `FALLBACK_CONFIDENCE=0.9`. Согласовать с заказчиком
  надёжную метрику порога (геометрия рамки номера / повторные кадры).
- **openFile cleanup:** удалять расшифрованные временные файлы из `cacheDir` после показа.
- **Изоляция по механику (CLAUDE.md §8):** per-user алиас ключа Keystore или
  `setUserAuthenticationRequired(true)` при биометрии.
- **Просмотр медиа:** экраны сейчас показывают плейсхолдеры; для реального превью
  зашифрованных фото подключить `crypto.openFile` в компонент-просмотрщик.
- **TurboModule (опц.):** при необходимости перевести с legacy-bridge на codegen-спеки.
