/**
 * CameraService — граница съёмки. Возвращает путь временного файла, который
 * затем запечатывается FilesService в папку кейса.
 *
 * В срезе (эмулятор, без реальной камеры) используется DevCameraService:
 * он пишет файл-плейсхолдер и возвращает его путь, чтобы сквозной поток работал.
 * Реальная интеграция react-native-vision-camera (live-preview + takePhoto/recordVideo)
 * подключается на устройстве к этому же интерфейсу.
 */
import type { FileSystem } from '../files/fileSystem';

export interface CapturedVideo {
  path: string;
  durationSec: number;
}

export interface CameraService {
  capturePhoto(): Promise<string>;
  captureVideo(durationSec: number): Promise<CapturedVideo>;
}

export class DevCameraService implements CameraService {
  private seq = 0;

  constructor(
    private readonly fs: FileSystem,
    private readonly tmpDir: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Гарантировать существование tmp-каталога (RNFS.writeFile не создаёт родителя). */
  private async ensureTmpDir(): Promise<void> {
    if (!(await this.fs.exists(this.tmpDir))) {
      await this.fs.mkdir(this.tmpDir);
    }
  }

  async capturePhoto(): Promise<string> {
    await this.ensureTmpDir();
    const path = `${this.tmpDir}/cap_${this.now()}_${this.seq++}.jpg`;
    await this.fs.writeFile(path, 'DEV_PLACEHOLDER_JPEG');
    return path;
  }

  async captureVideo(durationSec: number): Promise<CapturedVideo> {
    await this.ensureTmpDir();
    const path = `${this.tmpDir}/cap_${this.now()}_${this.seq++}.mp4`;
    await this.fs.writeFile(path, 'DEV_PLACEHOLDER_MP4');
    return { path, durationSec };
  }
}

/** Заглушка реальной камеры (vision-camera) — подключается на устройстве. */
export class VisionCameraService implements CameraService {
  async capturePhoto(): Promise<string> {
    throw new Error('VisionCameraService: подключите react-native-vision-camera на устройстве.');
  }
  async captureVideo(): Promise<CapturedVideo> {
    throw new Error('VisionCameraService: подключите react-native-vision-camera на устройстве.');
  }
}
