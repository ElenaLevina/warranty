/**
 * RnfsHttpTransport — real UploadTransport over HTTP. ALL network calls (file
 * upload, complete, health) go through `fetch`; react-native-fs is used only for
 * RNFS.stat (file size). Uploads moved off RNFS.uploadFiles after a field
 * incident where its native uploader could not reach the receiver on some phones
 * (Xiaomi/MIUI) while fetch worked — the file silently never left the device.
 * Runs on the device; not exercised by Node unit tests.
 *
 * Every call is bounded by an AbortController timeout, so an unreachable/asleep
 * receiver fails (the file stays queued) instead of hanging the UI.
 */
import RNFS from 'react-native-fs';
import type { CompleteParams, UploadFileParams, UploadTransport } from './uploadTransport';

/**
 * Per-file upload timeout. Uploads now go through `fetch` + FormData (the SAME
 * networking stack as the health/complete calls) because RNFS.uploadFiles failed
 * to reach the receiver on some devices (e.g. Xiaomi/MIUI) while fetch worked
 * fine — the file just never left the phone. FormData streams the file from disk
 * natively, so memory stays low; the timeout bounds a stalled connection.
 */
const UPLOAD_TIMEOUT_MS = 180_000;
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
    // Integrity: send the file size so the server can catch a truncated upload.
    // RNFS.stat is only a filesystem stat (works everywhere) — it is RNFS's
    // network uploader we are avoiding, not stat.
    const stat = await RNFS.stat(filePath);
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    // Multipart body: RN's FormData streams the file from `uri` natively (no
    // JS-memory copy) via the same OkHttp stack as the health check.
    const form = new FormData();
    form.append('filename', fileName);
    form.append('type', type);
    form.append('size', String(stat.size));
    // The {uri,name,type} file part is RN-specific; cast to satisfy the DOM type.
    form.append('file', { uri, name: fileName, type: mimeOf(type) } as unknown as Blob);

    const res = await fetchWithTimeout(
      `${baseUrl}/v1/cases/${encodeURIComponent(caseId)}/files`,
      {
        method: 'POST',
        // NOTE: do NOT set Content-Type — RN adds the multipart boundary itself.
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
      UPLOAD_TIMEOUT_MS,
    );
    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}) for ${fileName}`);
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
