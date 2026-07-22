import { CachedPreviewService, type Thumbnailer } from './previewService';
import { InMemoryFileSystem } from '../files/inMemoryFileSystem';
import { PassthroughCryptoService } from '../crypto/cryptoService';
import type { CaseFileEntry } from '../../types';

const CASES = '/data/cases';
const CACHE = '/data/tmp/thumbs';

function photoEntry(name = 'photo_001.jpg'): CaseFileEntry {
  return { name, type: 'photo', timestamp: '10:00:00' };
}
function videoEntry(name = 'video_001.mp4'): CaseFileEntry {
  return { name, type: 'video', timestamp: '10:00:00', duration_sec: 12 };
}

/** Fake thumbnailer: writes a marker file and counts invocations. */
function makeThumbnailer(fs: InMemoryFileSystem) {
  const calls = { photo: 0, video: 0 };
  const thumbnailer: Thumbnailer = {
    async photoThumb(src, dest) {
      calls.photo += 1;
      await fs.writeFile(dest, `thumb-of:${src}`);
    },
    async videoThumb(src, dest) {
      calls.video += 1;
      await fs.writeFile(dest, `frame-of:${src}`);
    },
  };
  return { thumbnailer, calls };
}

async function harness(withThumbnailer = true) {
  const fs = new InMemoryFileSystem();
  const crypto = new PassthroughCryptoService(fs);
  const { thumbnailer, calls } = makeThumbnailer(fs);
  await fs.mkdir(`${CASES}/case1`);
  await fs.writeFile(`${CASES}/case1/photo_001.jpg`, 'JPEG');
  await fs.writeFile(`${CASES}/case1/video_001.mp4`, 'MP4');
  const svc = new CachedPreviewService(fs, crypto, CASES, CACHE, withThumbnailer ? thumbnailer : null);
  return { fs, svc, calls };
}

describe('CachedPreviewService', () => {
  it('returns null without a native thumbnailer (icon fallback)', async () => {
    const { svc } = await harness(false);
    expect(await svc.getPreview('case1', photoEntry())).toBeNull();
  });

  it('generates a photo thumbnail once and serves it from cache after', async () => {
    const { svc, calls, fs } = await harness();
    const p1 = await svc.getPreview('case1', photoEntry());
    expect(p1).toBe(`${CACHE}/case1__photo_001.jpg.thumb.jpg`);
    expect(await fs.exists(p1!)).toBe(true);

    const p2 = await svc.getPreview('case1', photoEntry());
    expect(p2).toBe(p1);
    expect(calls.photo).toBe(1); // cached, not regenerated
  });

  it('uses the video frame grabber for videos', async () => {
    const { svc, calls } = await harness();
    const p = await svc.getPreview('case1', videoEntry());
    expect(p).toBe(`${CACHE}/case1__video_001.mp4.thumb.jpg`);
    expect(calls.video).toBe(1);
  });

  it('invalidate() drops one thumbnail so it regenerates', async () => {
    const { svc, calls } = await harness();
    await svc.getPreview('case1', photoEntry());
    await svc.invalidate('case1', 'photo_001.jpg');
    await svc.getPreview('case1', photoEntry());
    expect(calls.photo).toBe(2);
  });

  it('clearCase() removes only that case thumbnails', async () => {
    const { svc, fs } = await harness();
    await fs.mkdir(`${CASES}/case2`);
    await fs.writeFile(`${CASES}/case2/photo_001.jpg`, 'JPEG');
    const a = await svc.getPreview('case1', photoEntry());
    const b = await svc.getPreview('case2', photoEntry());

    await svc.clearCase('case1');
    expect(await fs.exists(a!)).toBe(false);
    expect(await fs.exists(b!)).toBe(true);
  });

  it('warm() builds the thumbnail from a plaintext path without decrypting', async () => {
    const { fs, svc, calls } = await harness();
    await fs.writeFile('/tmp/fresh.jpg', 'CAMERA_JPEG');
    await svc.warm('case1', photoEntry('photo_002.jpg'), '/tmp/fresh.jpg');

    // Thumbnail cached under the entry name; a later getPreview serves it from
    // cache without generating again.
    const thumb = `${CACHE}/case1__photo_002.jpg.thumb.jpg`;
    expect(await fs.exists(thumb)).toBe(true);
    expect(await fs.readFile(thumb)).toBe('thumb-of:/tmp/fresh.jpg');
    calls.photo = 0;
    expect(await svc.getPreview('case1', photoEntry('photo_002.jpg'))).toBe(thumb);
    expect(calls.photo).toBe(0);
  });

  it('getReadable/releaseReadable round-trips (passthrough keeps the path)', async () => {
    const { svc } = await harness();
    const readable = await svc.getReadable('case1', 'photo_001.jpg');
    expect(readable).toBe(`${CASES}/case1/photo_001.jpg`);
    // Passthrough: releasing must NOT delete the original sealed file.
    await svc.releaseReadable('case1', 'photo_001.jpg', readable);
    expect(await svc.getReadable('case1', 'photo_001.jpg')).toBe(readable);
  });
});
