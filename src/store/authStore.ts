/**
 * Auth store (Zustand) — UI projection of the local authentication state.
 * Backed by AuthService (local-only PIN). Implemented as a vanilla-store factory
 * so it can be unit-tested without React.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AuthService, MechanicIdentity } from '../services/auth/authService';

export type AuthStatus = 'unregistered' | 'locked' | 'authenticated';

/** PIN must be 4–6 digits. */
const PIN_RE = /^\d{4,6}$/;

export interface AuthState {
  status: AuthStatus;
  current: MechanicIdentity | null;
  /** Login of the registered mechanic, shown on the lock screen. */
  registeredLogin: string | null;
  error: string | null;

  /** Resolve the initial status from persisted registration. */
  init(): void;
  register(login: string, pin: string, pinConfirm: string): boolean;
  unlock(pin: string): boolean;
  lock(): void;
  /** Employee switch: clear registration and return to the register screen. */
  switchUser(): void;
}

export type AuthStore = StoreApi<AuthState>;

export function createAuthStore(auth: AuthService): AuthStore {
  return createStore<AuthState>((set) => ({
    status: auth.isRegistered() ? 'locked' : 'unregistered',
    current: null,
    registeredLogin: auth.registeredLogin(),
    error: null,

    init() {
      set({
        status: auth.isRegistered() ? 'locked' : 'unregistered',
        current: null,
        registeredLogin: auth.registeredLogin(),
        error: null,
      });
    },

    register(login, pin, pinConfirm) {
      // Errors are i18n keys; the screen renders them via t(error).
      if (login.trim().length === 0) {
        set({ error: 'auth.enterLogin' });
        return false;
      }
      if (!PIN_RE.test(pin)) {
        set({ error: 'auth.pinFormat' });
        return false;
      }
      if (pin !== pinConfirm) {
        set({ error: 'auth.pinMismatch' });
        return false;
      }
      const identity = auth.register(login, pin);
      set({
        status: 'authenticated',
        current: identity,
        registeredLogin: identity.login,
        error: null,
      });
      return true;
    },

    unlock(pin) {
      const identity = auth.unlock(pin);
      if (identity === null) {
        set({ error: 'auth.wrongPin' });
        return false;
      }
      set({ status: 'authenticated', current: identity, error: null });
      return true;
    },

    lock() {
      auth.lock();
      set({ status: 'locked', current: null, error: null });
    },

    switchUser() {
      auth.reset();
      set({ status: 'unregistered', current: null, registeredLogin: null, error: null });
    },
  }));
}
