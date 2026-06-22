/* eslint-disable no-undef */
// Mocks for native modules so component/screen tests can run on Node (no device).
// Pure-logic tests (parser, lifecycle, files guard) use in-memory fakes via DI and
// do not depend on these mocks.

// react-native-mmkv — in-memory key/value store
jest.mock('react-native-mmkv', () => {
  class MMKV {
    constructor() {
      this.store = new Map();
    }
    set(key, value) {
      this.store.set(key, value);
    }
    getString(key) {
      const v = this.store.get(key);
      return typeof v === 'string' ? v : undefined;
    }
    getBoolean(key) {
      return Boolean(this.store.get(key));
    }
    getNumber(key) {
      const v = this.store.get(key);
      return typeof v === 'number' ? v : undefined;
    }
    contains(key) {
      return this.store.has(key);
    }
    delete(key) {
      this.store.delete(key);
    }
    getAllKeys() {
      return Array.from(this.store.keys());
    }
    clearAll() {
      this.store.clear();
    }
  }
  return { MMKV };
});

// react-native-fs — minimal stubs; real file IO is faked in unit tests via DI.
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp/warranty-test',
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(false)),
  readDir: jest.fn(() => Promise.resolve([])),
  moveFile: jest.fn(() => Promise.resolve()),
}));

// react-native-vision-camera — avoid native bindings in tests.
// (Реальная камера рендерится только при FEATURES.realCamera, в тестах — dev-путь.)
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
  useMicrophonePermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
}));

// gesture-handler / screens setup
jest.mock('react-native-gesture-handler', () => ({}));

// Initialize i18n for component tests (defaults to English under the MMKV mock).
require('./src/i18n');
