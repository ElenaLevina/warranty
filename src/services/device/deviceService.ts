/**
 * DeviceService — provides a stable per-install device identifier for file
 * metadata (CLAUDE.md §8: "who / when / with which device").
 *
 * v1.0 keeps a generated id in MMKV (one per app installation). It is not a
 * hardware id (Android restricts those); it identifies the install, which is
 * enough to attribute a case to the device that recorded it. Can be swapped for
 * a hardware-backed id later behind this same interface.
 */
import { sha256 } from 'js-sha256';
import { MMKV } from 'react-native-mmkv';

export interface DeviceService {
  getDeviceId(): string;
}

const K_DEVICE_ID = 'device.id';

export class MmkvDeviceService implements DeviceService {
  private readonly store: MMKV;

  constructor(encryptionKey?: string, id = 'warranty-device') {
    this.store = new MMKV({ id, ...(encryptionKey ? { encryptionKey } : {}) });
  }

  getDeviceId(): string {
    const existing = this.store.getString(K_DEVICE_ID);
    if (existing !== undefined) {
      return existing;
    }
    const generated = `dev_${sha256(`${Date.now()}|${Math.random()}`).slice(0, 12)}`;
    this.store.set(K_DEVICE_ID, generated);
    return generated;
  }
}
