/**
 * Реализация FileSystem поверх react-native-fs (реальное устройство).
 */
import RNFS from 'react-native-fs';
import type { FileSystem, FsDirEntry } from './fileSystem';

export class RnfsFileSystem implements FileSystem {
  async mkdir(path: string): Promise<void> {
    await RNFS.mkdir(path);
  }

  async exists(path: string): Promise<boolean> {
    return RNFS.exists(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    await RNFS.writeFile(path, contents, 'utf8');
  }

  async readFile(path: string): Promise<string> {
    return RNFS.readFile(path, 'utf8');
  }

  async appendFile(path: string, contents: string): Promise<void> {
    await RNFS.appendFile(path, contents, 'utf8');
  }

  async copyFile(from: string, to: string): Promise<void> {
    await RNFS.copyFile(from, to);
  }

  async moveFile(from: string, to: string): Promise<void> {
    await RNFS.moveFile(from, to);
  }

  async unlink(path: string): Promise<void> {
    await RNFS.unlink(path);
  }

  async readDir(path: string): Promise<FsDirEntry[]> {
    const items = await RNFS.readDir(path);
    return items.map(i => ({
      name: i.name,
      path: i.path,
      isFile: i.isFile(),
      isDirectory: i.isDirectory(),
    }));
  }

  async chmod(_path: string, _mode: number): Promise<void> {
    // ВНИМАНИЕ: react-native-fs не предоставляет cross-platform chmod.
    // Снятие write-бита на закрытом кейсе требует отдельного нативного модуля.
    // Реальный инвариант READ ONLY обеспечивается app-level guard в FilesService;
    // chmod — defense-in-depth и здесь no-op до добавления нативной реализации.
  }
}
