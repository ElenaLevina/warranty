/**
 * RnfsHttpTransport — real UploadTransport over HTTP using react-native-fs for
 * multipart file upload (with progress) and fetch for JSON/health.
 * Runs on the device; not exercised by Node unit tests.
 *
 * Timeouts (added after a field incident where a sleeping PC left uploads
 * hanging forever and the app stopped responding): every network call is
 * bounded, so an unreachable/asleep receiver makes the request FAIL quickly.
 * The file then stays queued and is retried later — the UI never freezes.
 *  - file upload: inactivity timeout (reset on each progress tick), so a large
 *    video on slow Wi-Fi keeps going, but a stalled connection is aborted;
 *  - complete / health: fixed AbortController timeouts.
 */
import RNFS from 'react-native-fs';
import type { CompleteParams, UploadFileParams, UploadTransport } from './uploadTransport';

/** No upload progress for this long -> abort the transfer (stalled connection). */
const UPLOAD_INACTIVITY_MS = 20_000;
/** POST session.json — small body. */
const COMPLETE_TIMEOUT_MS = 15_000;
/** Connectivity probe — keep it snappy for the Settings "test connection" button. */
const HEALTH_TIMEOUT_MS = 8_000;

function mimeOf(type: 'photo' | 'video' | 'meta'): string {
  if (type === 'photo') {
    return 'image/jpeg';
  }
  if (type === 'video') {
    return 'video/mp4';
  }
  return 'application/json';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class RnfsHttpTransport implements UploadTransport {
  async uploadFile(params: UploadFileParams): Promise<void> {
    const { baseUrl, token, caseId, filePath, fileName, type } = params;
    // Integrity: send the file size (RNFS.stat is reliable, unlike RNFS.hash).
    // The server verifies it received exactly this many bytes — catches
    // truncated/incomplete uploads (e.g. a dropped connection mid-video).
    const stat = await RNFS.stat(filePath);

    let jobId = -1;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timedOut = true;
        if (jobId >= 0) {
          RNFS.stopUpload(jobId);
        }
      }, UPLOAD_INACTIVITY_MS);
    };

    const upload = RNFS.uploadFiles({
      toUrl: `${baseUrl}/v1/cases/${encodeURIComponent(caseId)}/files`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      fields: { filename: fileName, type, size: String(stat.size) },
      files: [
        {
          name: 'file',
          filename: fileName,
          filepath: filePath.replace(/^file:\/\//, ''),
          filetype: mimeOf(type),
        },
      ],
      begin: () => arm(),
      progress: () => arm(),
    });
    jobId = upload.jobId;
    arm(); // start the clock even before the connection is established

    try {
      const result = await upload.promise;
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Upload failed (${result.statusCode}) for ${fileName}`);
      }
    } catch (e) {
      if (timedOut) {
        throw new Error(`Upload timed out for ${fileName} (receiver unreachable)`);
      }
      throw e;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async complete(params: CompleteParams): Promise<void> {
    const { baseUrl, token, caseId, sessionJson } = params;
    const res = await fetchWithTimeout(
      `${baseUrl}/v1/cases/${encodeURIComponent(caseId)}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: sessionJson,
      },
      COMPLETE_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(`Complete failed (${res.status}) for case ${caseId}`);
    }
  }

  async health(baseUrl: string, token: string): Promise<boolean> {
    const probe = (async (): Promise<boolean> => {
      try {
        const res = await fetchWithTimeout(
          `${baseUrl}/v1/health`,
          { headers: { Authorization: `Bearer ${token}` } },
          HEALTH_TIMEOUT_MS,
        );
        return res.ok;
      } catch {
        return false; // network error OR timeout -> "no connection"
      }
    })();
    // Hard guarantee: resolve false after the timeout even if the fetch never
    // settles. On Android, AbortController does NOT reliably cut a connect that
    // is stuck on a Wi-Fi-with-no-route (dead LAN): the fetch can hang far past
    // its timer. Racing a plain timer keeps this promise bounded no matter what,
    // so callers (queue probe, Settings test) never wait indefinitely.
    let guard: ReturnType<typeof setTimeout>;
    const timeout = new Promise<boolean>(resolve => {
      guard = setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS + 500);
    });
    return Promise.race([probe, timeout]).finally(() => clearTimeout(guard));
  }
}
