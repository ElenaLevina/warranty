/**
 * In-memory реализация FileSystem для юнит-тестов. Не зависит от устройства.
 */
import type { FileSystem, FsDirEntry } from './fileSystem';

interface FileNode {
  contents: string;
  mode: number;
}

const DEFAULT_MODE = 0o644;

function normalize(p: string): string {
  // Убрать хвостовой слэш (кроме корня) и схлопнуть двойные слэши.
  const collapsed = p.replace(/\/+/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
}

function parentOf(p: string): string {
  const n = normalize(p);
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

function baseName(p: string): string {
  const n = normalize(p);
  const idx = n.lastIndexOf('/');
  return idx < 0 ? n : n.slice(idx + 1);
}

export class InMemoryFileSystem implements FileSystem {
  private files = new Map<string, FileNode>();
  private dirs = new Set<string>(['/']);

  async mkdir(path: string): Promise<void> {
    // Рекурсивно создать путь.
    const parts = normalize(path).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur += '/' + part;
      this.dirs.add(cur);
    }
  }

  async exists(path: string): Promise<boolean> {
    const n = normalize(path);
    return this.files.has(n) || this.dirs.has(n);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    const n = normalize(path);
    await this.mkdir(parentOf(n));
    const existing = this.files.get(n);
    this.files.set(n, { contents, mode: existing?.mode ?? DEFAULT_MODE });
  }

  async readFile(path: string): Promise<string> {
    const n = normalize(path);
    const node = this.files.get(n);
    if (node === undefined) {
      throw new Error(`ENOENT: no such file '${n}'`);
    }
    return node.contents;
  }

  async appendFile(path: string, contents: string): Promise<void> {
    const n = normalize(path);
    const node = this.files.get(n);
    if (node === undefined) {
      await this.writeFile(n, contents);
    } else {
      node.contents += contents;
    }
  }

  async copyFile(from: string, to: string): Promise<void> {
    const src = this.files.get(normalize(from));
    if (src === undefined) {
      throw new Error(`ENOENT: copy source '${from}'`);
    }
    await this.writeFile(to, src.contents);
  }

  async moveFile(from: string, to: string): Promise<void> {
    await this.copyFile(from, to);
    this.files.delete(normalize(from));
  }

  async unlink(path: string): Promise<void> {
    this.files.delete(normalize(path));
  }

  async readDir(path: string): Promise<FsDirEntry[]> {
    const dir = normalize(path);
    const entries: FsDirEntry[] = [];
    const seenDirs = new Set<string>();
    for (const filePath of this.files.keys()) {
      if (parentOf(filePath) === dir) {
        entries.push({ name: baseName(filePath), path: filePath, isFile: true, isDirectory: false });
      }
    }
    for (const dirPath of this.dirs) {
      if (dirPath !== '/' && parentOf(dirPath) === dir && !seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        entries.push({ name: baseName(dirPath), path: dirPath, isFile: false, isDirectory: true });
      }
    }
    return entries;
  }

  async chmod(path: string, mode: number): Promise<void> {
    const node = this.files.get(normalize(path));
    if (node !== undefined) {
      node.mode = mode;
    }
  }

  // --- тест-хелперы ---
  /** Текущий режим файла (для проверки снятия write-бита). */
  getMode(path: string): number | undefined {
    return this.files.get(normalize(path))?.mode;
  }
  /** Все пути файлов (для ассертов). */
  listFiles(): string[] {
    return Array.from(this.files.keys()).sort();
  }
}
