/**
 * Порт файловой системы. Абстрагирует react-native-fs, чтобы бизнес-логику
 * (FilesService) можно было тестировать на Node без устройства.
 */
export interface FsDirEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileSystem {
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  writeFile(path: string, contents: string): Promise<void>;
  readFile(path: string): Promise<string>;
  appendFile(path: string, contents: string): Promise<void>;
  /** Скопировать файл (источник может быть временным путём камеры). */
  copyFile(from: string, to: string): Promise<void>;
  moveFile(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readDir(path: string): Promise<FsDirEntry[]>;
  /** Снять/выставить права (app-level READ ONLY). Может быть no-op на некоторых ФС. */
  chmod(path: string, mode: number): Promise<void>;
}
