/**
 * AuthService — local-only authentication (no backend in v1.0).
 *
 * Model (per product decision):
 *  - First launch: register a mechanic (login + PIN). mechanicId is derived
 *    locally from the login.
 *  - Next launches: app is "locked"; unlock with the PIN.
 *  - Employee switch: reset() clears the stored registration so a different
 *    mechanic can register. Cases on disk are isolated by mechanic_id (filtered
 *    in FilesService.listOpenSessions), so a new mechanic never sees old cases.
 *
 * PIN is never stored in plaintext: we keep a per-install random salt and the
 * salted SHA-256 hash, inside an encrypted MMKV instance (defense in depth).
 * Biometrics are intentionally out of scope here and can be added behind this
 * same interface later.
 */
import { sha256 } from 'js-sha256';
import { MMKV } from 'react-native-mmkv';

export interface MechanicIdentity {
  /** Stable id stored into session.json (e.g. "user_1a2b3c4d"). */
  mechanicId: string;
  /** Human-readable login the mechanic typed at registration. */
  login: string;
}

export interface AuthService {
  /** True if a mechanic has been registered on this device. */
  isRegistered(): boolean;
  /** Register a mechanic and return the new identity (also unlocks). */
  register(login: string, pin: string): MechanicIdentity;
  /** Validate the PIN. Returns the identity on success, null on mismatch. */
  unlock(pin: string): MechanicIdentity | null;
  /** Currently unlocked identity, or null when locked/unregistered. */
  current(): MechanicIdentity | null;
  /** Lock the app (keeps the registration, clears the in-memory session). */
  lock(): void;
  /** Clear the stored registration (employee switch / fresh start). */
  reset(): void;
}

const K_LOGIN = 'auth.login';
const K_MECHANIC_ID = 'auth.mechanicId';
const K_SALT = 'auth.salt';
const K_PIN_HASH = 'auth.pinHash';

/** Derive a stable mechanic id from a login string. */
export function deriveMechanicId(login: string): string {
  return `user_${sha256(login.trim().toLowerCase()).slice(0, 8)}`;
}

/** Generate a pseudo-random hex salt (local-only PIN threat model). */
function makeSalt(seed: string): string {
  return sha256(`${Date.now()}|${Math.random()}|${seed}`).slice(0, 16);
}

function hashPin(salt: string, pin: string): string {
  return sha256(`${salt}:${pin}`);
}

export class MmkvAuthService implements AuthService {
  private readonly store: MMKV;
  private session: MechanicIdentity | null = null;

  constructor(encryptionKey?: string, id = 'warranty-auth') {
    this.store = new MMKV({
      id,
      ...(encryptionKey ? { encryptionKey } : {}),
    });
  }

  isRegistered(): boolean {
    return this.store.contains(K_PIN_HASH) && this.store.contains(K_MECHANIC_ID);
  }

  register(login: string, pin: string): MechanicIdentity {
    const trimmed = login.trim();
    const mechanicId = deriveMechanicId(trimmed);
    const salt = makeSalt(trimmed);
    this.store.set(K_LOGIN, trimmed);
    this.store.set(K_MECHANIC_ID, mechanicId);
    this.store.set(K_SALT, salt);
    this.store.set(K_PIN_HASH, hashPin(salt, pin));
    this.session = { mechanicId, login: trimmed };
    return this.session;
  }

  unlock(pin: string): MechanicIdentity | null {
    const salt = this.store.getString(K_SALT);
    const expected = this.store.getString(K_PIN_HASH);
    const mechanicId = this.store.getString(K_MECHANIC_ID);
    const login = this.store.getString(K_LOGIN);
    if (salt === undefined || expected === undefined || mechanicId === undefined || login === undefined) {
      return null;
    }
    if (hashPin(salt, pin) !== expected) {
      return null;
    }
    this.session = { mechanicId, login };
    return this.session;
  }

  current(): MechanicIdentity | null {
    return this.session;
  }

  lock(): void {
    this.session = null;
  }

  reset(): void {
    this.session = null;
    this.store.delete(K_LOGIN);
    this.store.delete(K_MECHANIC_ID);
    this.store.delete(K_SALT);
    this.store.delete(K_PIN_HASH);
  }
}
