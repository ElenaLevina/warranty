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
    // Normalize: strip a trailing slash from the base URL.
    next.baseUrl = next.baseUrl.replace(/\/+$/, '');
    this.store.set(KEY, JSON.stringify(next));
  }
}
