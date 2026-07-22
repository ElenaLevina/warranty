/**
 * Upload configuration — where finished case files are sent on the LAN.
 * Edited by the responsible employee on the in-app Settings screen and persisted
 * in MMKV. Local-only / no backend: this points at a small receiver service
 * running on a specific PC (fixed IP/hostname).
 */
import { MMKV } from 'react-native-mmkv';

export interface UploadSettings {
  /** Master switch: when false, files stay local (stub behavior). */
  enabled: boolean;
  /** Receiver base URL, e.g. http://192.168.1.50:8080 (no trailing slash). */
  baseUrl: string;
  /** Bearer token shared with the receiver. */
  token: string;
}

export const DEFAULT_UPLOAD_SETTINGS: UploadSettings = {
  enabled: false,
  baseUrl: '',
  token: '',
};

export interface UploadConfig {
  get(): UploadSettings;
  set(patch: Partial<UploadSettings>): void;
}

const KEY = 'upload.settings';

/**
 * Strip anything that must never be in a URL/token but an RTL (Hebrew/Arabic)
 * keyboard can silently insert: all whitespace (incl. nbsp), zero-width chars,
 * and Unicode bidi/direction marks (LRM/RLM, embeddings, isolates). Without
 * this, a value that LOOKS like "http://…:8080" carries an invisible mark and
 * fetch/RNFS can't reach the server — the connection test just spins.
 */
function sanitizeConfigValue(v: string): string {
  // Strip whitespace (incl. nbsp) and zero-width / bidi direction marks that an
  // RTL keyboard can silently inject (LRM/RLM, embeddings/overrides, isolates,
  // BOM). Otherwise a value that LOOKS like the URL carries an invisible char
  // and fetch/RNFS can't reach the server.
  return v.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
}

export class MmkvUploadConfig implements UploadConfig {
  private readonly store: MMKV;

  constructor(encryptionKey?: string, id = 'warranty-upload') {
    this.store = new MMKV({ id, ...(encryptionKey ? { encryptionKey } : {}) });
  }

  get(): UploadSettings {
    const raw = this.store.getString(KEY);
    if (raw === undefined) {
      return { ...DEFAULT_UPLOAD_SETTINGS };
    }
    try {
      return { ...DEFAULT_UPLOAD_SETTINGS, ...(JSON.parse(raw) as Partial<UploadSettings>) };
    } catch {
      return { ...DEFAULT_UPLOAD_SETTINGS };
    }
  }

  set(patch: Partial<UploadSettings>): void {
    const next = { ...this.get(), ...patch };
    // Remove invisible/whitespace chars (RTL keyboards inject them), then the
    // trailing slash from the base URL.
    next.baseUrl = sanitizeConfigValue(next.baseUrl).replace(/\/+$/, '');
    next.token = sanitizeConfigValue(next.token);
    this.store.set(KEY, JSON.stringify(next));
  }
}
