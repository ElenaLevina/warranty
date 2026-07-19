/**
 * NativeThumbnailer — device implementation of the Thumbnailer port.
 *  - photos: @bam.tech/react-native-image-resizer (~300px JPEG)
 *  - videos: react-native-create-thumbnail (frame grab -> JPEG)
 * Both libraries write into their own temp locations; we move the result into
 * the requested destPath so the cache layout stays under our control.
 */
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { createThumbnail } from 'react-native-create-thumbnail';
import type { FileSystem } from '../files/fileSystem';
import type { Thumbnailer } from './previewService';

const THUMB_SIZE = 320;
const THUMB_QUALITY = 70;

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

export class NativeThumbnailer implements Thumbnailer {
  constructor(private readonly fs: FileSystem) {}

  async photoThumb(readablePath: string, destPath: string): Promise<void> {
    const res = await ImageResizer.createResizedImage(
      `file://${readablePath}`,
      THUMB_SIZE,
      THUMB_SIZE,
      'JPEG',
      THUMB_QUALITY,
      0,
      undefined,
      false,
      { mode: 'contain', onlyScaleDown: true },
    );
    await this.fs.moveFile(stripFileScheme(res.uri), destPath);
  }

  async videoThumb(readablePath: string, destPath: string): Promise<void> {
    const res = await createThumbnail({
      url: `file://${readablePath}`,
      timeStamp: 1000, // 1s into the clip: skips potential black first frame
      format: 'jpeg',
    });
    await this.fs.moveFile(stripFileScheme(res.path), destPath);
  }
}
