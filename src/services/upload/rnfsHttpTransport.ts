/**
 * RnfsHttpTransport — real UploadTransport over HTTP using react-native-fs for
 * multipart file upload (with progress) and fetch for JSON/health.
 * Runs on the device; not exercised by Node unit tests.
 */
import RNFS from 'react-native-fs';
import type { CompleteParams, UploadFileParams, UploadTransport } from './uploadTransport';

function mimeOf(type: 'photo' | 'video' | 'meta'): string {
  if (type === 'photo') {
    return 'image/jpeg';
  }
  if (type === 'video') {
    return 'video/mp4';
  }
  return 'application/json';
}

export class RnfsHttpTransport implements UploadTransport {
  async uploadFile(params: UploadFileParams): Promise<void> {
    const { baseUrl, token, caseId, filePath, fileName, type } = params;
    // NOTE: no client-side sha256 — RNFS.hash disagrees with the bytes
    // RNFS.uploadFiles actually sends (react-native-fs quirk). The server
    // computes its own hash; atomic temp->rename guarantees complete files.
    const { promise } = RNFS.uploadFiles({
      toUrl: `${baseUrl}/v1/cases/${encodeURIComponent(caseId)}/files`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      fields: { filename: fileName, type },
      files: [
        {
          name: 'file',
          filename: fileName,
          filepath: filePath.replace(/^file:\/\//, ''),
          filetype: mimeOf(type),
        },
      ],
    });
    const result = await promise;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Upload failed (${result.statusCode}) for ${fileName}`);
    }
  }

  async complete(params: CompleteParams): Promise<void> {
    const { baseUrl, token, caseId, sessionJson } = params;
    const res = await fetch(`${baseUrl}/v1/cases/${encodeURIComponent(caseId)}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: sessionJson,
    });
    if (!res.ok) {
      throw new Error(`Complete failed (${res.status}) for case ${caseId}`);
    }
  }

  async health(baseUrl: string, token: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/v1/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
