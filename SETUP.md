# Warranty — настройка среды разработки

Локальное окружение для разработки модуля фото/видео. Проект: **React Native, только Android** (минимум Android 10 / API 29). iOS вне скоупа — инструменты Apple не нужны.

## База

- **Node.js** — LTS (18 или 20+). npm идёт в комплекте; можно Yarn.
- **Git** — контроль версий.
- **Watchman** (macOS/Linux) — отслеживание изменений файлов, ускоряет Metro-бандлер. На Windows не требуется.
- **JDK 17** (Temurin / Azul Zulu) — современные версии React Native требуют именно 17 (не 11 и не 21).

## Android-окружение

- **Android Studio** — ставит Android SDK, эмулятор и менеджеры.
- **Android SDK Platform** для **API 29 (Android 10)** — это `minSdk`; плюс последняя стабильная платформа как `targetSdk`.
- **Android SDK Build-Tools** и **platform-tools** (включает `adb`).
- **Android Emulator** + хотя бы один AVD, либо реальное устройство.
- **NDK и CMake** — обязательно: `react-native-vision-camera` и нативный мост ML Kit компилируют нативный код. Ставятся через SDK Manager в Android Studio.

### Переменные окружения

- `ANDROID_HOME` (или `ANDROID_SDK_ROOT`) → путь к Android SDK.
- `JAVA_HOME` → путь к JDK 17.
- Добавить в `PATH`: `platform-tools` (для `adb`).

## Инструменты React Native

- CLI отдельно ставить не нужно — запускается через `npx react-native ...`.
- Зависимости проекта подтянутся через `npm install` по `package.json`:
  `react-native-vision-camera`, нативный мост Google ML Kit Text Recognition v2,
  `react-native-fs`, библиотека шифрования кэша, `@react-navigation`.

## Устройство для тестов

Камера и OCR плохо тестируются на эмуляторе (виртуальная камера без нормального автофокуса и реального кадра номера).

- **Нужен физический Android-телефон**, Android 10+, камера **≥8 МП**, USB + включённая отладка (USB debugging).
- Эмулятор подойдёт для навигации, логики сессий и офлайн-очереди.
- Распознавание номера и съёмку проверять **только на реальном устройстве**.

## Не требуется

CocoaPods, Xcode, Ruby — это для iOS, который вне скоупа v1.0.

## Проверка

```bash
npx react-native doctor
```

Покажет, что в окружении настроено, а что нужно доустановить.
