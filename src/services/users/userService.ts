/**
 * UserService — admin-provisioned, local-only user list (no backend in v1.0).
 *
 * Model (per product decision):
 *  - An administrator maintains the user list on the device: first name, last
 *    name, role (admin | mechanic), interface language, and PIN.
 *  - First launch (empty list) -> create the first admin (handled by the UI).
 *  - Login: the user is picked from the list and enters the PIN the admin
 *    assigned. Identity (`id`) is stored into session.json as mechanic_id, so
 *    cases stay isolated per user.
 *
 * PINs are never stored in plaintext: a per-user random salt + salted SHA-256
 * hash, kept in an encrypted MMKV instance (defense in depth). Biometrics are
 * out of scope and can be added behind this same interface later.
 */
import { sha256 } from 'js-sha256';
import { MMKV } from 'react-native-mmkv';
import type { AppLanguage } from '../../i18n/languageStore';

export type UserRole = 'admin' | 'mechanic';

/** Public user info (no secret material) — safe to expose to the UI. */
export interface User {
  /** Stable id stored into session.json as mechanic_id (e.g. "user_1a2b3c4d"). */
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  language: AppLanguage;
}

/** Admin-provided fields when creating or editing a user. */
export interface UserInput {
  firstName: string;
  lastName: string;
  role: UserRole;
  language: AppLanguage;
  /** Required on create. On update, an empty string means "keep current PIN". */
  pin: string;
}

/** Stored record: public fields plus the salted PIN hash. Internal only. */
interface UserRecord extends User {
  pinSalt: string;
  pinHash: string;
}

export interface UserService {
  /** All users (without secrets), in insertion order. */
  list(): User[];
  hasUsers(): boolean;
  hasAdmin(): boolean;
  get(id: string): User | null;
  /** Provision a new user. Throws on invalid PIN. */
  add(input: UserInput): User;
  /** Edit fields; if input.pin is non-empty it resets the PIN. */
  update(id: string, input: UserInput): User | null;
  /** Remove a user. Throws if it would leave the list without an admin. */
  remove(id: string): void;
  /** Login: verify the PIN for a user. Returns the user on success, else null. */
  verifyPin(id: string, pin: string): User | null;
}

const K_USERS = 'users';

/** PIN must be 4–6 digits. Exported for reuse by the UI/store layer. */
export const PIN_RE = /^\d{4,6}$/;
export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

function makeId(seed: string): string {
  return `user_${sha256(`${Date.now()}|${Math.random()}|${seed}`).slice(0, 8)}`;
}

function makeSalt(seed: string): string {
  return sha256(`${Date.now()}|${Math.random()}|${seed}`).slice(0, 16);
}

function hashPin(salt: string, pin: string): string {
  return sha256(`${salt}:${pin}`);
}

function toPublic(r: UserRecord): User {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    role: r.role,
    language: r.language,
  };
}

export class MmkvUserService implements UserService {
  private readonly store: MMKV;

  constructor(encryptionKey?: string, id = 'warranty-users') {
    this.store = new MMKV({
      id,
      ...(encryptionKey ? { encryptionKey } : {}),
    });
  }

  private read(): UserRecord[] {
    const raw = this.store.getString(K_USERS);
    if (raw === undefined) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as UserRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(records: UserRecord[]): void {
    this.store.set(K_USERS, JSON.stringify(records));
  }

  list(): User[] {
    return this.read().map(toPublic);
  }

  hasUsers(): boolean {
    return this.read().length > 0;
  }

  hasAdmin(): boolean {
    return this.read().some(r => r.role === 'admin');
  }

  get(id: string): User | null {
    const found = this.read().find(r => r.id === id);
    return found === undefined ? null : toPublic(found);
  }

  add(input: UserInput): User {
    if (!isValidPin(input.pin)) {
      throw new Error('PIN must be 4-6 digits');
    }
    const records = this.read();
    const salt = makeSalt(input.firstName + input.lastName);
    const record: UserRecord = {
      id: makeId(input.firstName + input.lastName),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      language: input.language,
      pinSalt: salt,
      pinHash: hashPin(salt, input.pin),
    };
    records.push(record);
    this.write(records);
    return toPublic(record);
  }

  update(id: string, input: UserInput): User | null {
    const records = this.read();
    const idx = records.findIndex(r => r.id === id);
    const prev = records[idx];
    if (prev === undefined) {
      return null;
    }
    // Guard: don't demote the last remaining admin.
    if (prev.role === 'admin' && input.role !== 'admin') {
      const otherAdmins = records.filter(r => r.id !== id && r.role === 'admin');
      if (otherAdmins.length === 0) {
        throw new Error('Cannot remove the last admin');
      }
    }
    const next: UserRecord = {
      ...prev,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      language: input.language,
    };
    if (input.pin.length > 0) {
      if (!isValidPin(input.pin)) {
        throw new Error('PIN must be 4-6 digits');
      }
      next.pinSalt = makeSalt(input.firstName + input.lastName);
      next.pinHash = hashPin(next.pinSalt, input.pin);
    }
    records[idx] = next;
    this.write(records);
    return toPublic(next);
  }

  remove(id: string): void {
    const records = this.read();
    const target = records.find(r => r.id === id);
    if (target === undefined) {
      return;
    }
    if (target.role === 'admin') {
      const otherAdmins = records.filter(r => r.id !== id && r.role === 'admin');
      if (otherAdmins.length === 0) {
        throw new Error('Cannot remove the last admin');
      }
    }
    this.write(records.filter(r => r.id !== id));
  }

  verifyPin(id: string, pin: string): User | null {
    const record = this.read().find(r => r.id === id);
    if (record === undefined) {
      return null;
    }
    return hashPin(record.pinSalt, pin) === record.pinHash ? toPublic(record) : null;
  }
}
