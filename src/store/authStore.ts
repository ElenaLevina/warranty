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
    error: null,

    init() {
      set({
        status: auth.isRegistered() ? 'locked' : 'unregistered',
        current: null,
        error: null,
      });
    },

    register(login, pin, pinConfirm) {
      if (login.trim().length === 0) {
        set({ error: 'Введите логин механика' });
        return false;
      }
      if (!PIN_RE.test(pin)) {
        set({ error: 'PIN должен содержать 4–6 цифр' });
        return false;
      }
      if (pin !== pinConfirm) {
        set({ error: 'PIN не совпадает' });
        return false;
      }
      const identity = auth.register(login, pin);
      set({ status: 'authenticated', current: identity, error: null });
      return true;
    },

    unlock(pin) {
      const identity = auth.unlock(pin);
      if (identity === null) {
        set({ error: 'Неверный PIN' });
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
      set({ status: 'unregistered', current: null, error: null });
    },
  }));
}
