/**
 * Auth store (Zustand) — UI projection of the local authentication state over
 * the admin-provisioned user list (AuthService / UserService).
 *
 * Statuses:
 *  - 'no-users'      : empty list -> create the first administrator.
 *  - 'locked'        : users exist -> pick a user and enter the PIN.
 *  - 'authenticated' : a user is logged in.
 *
 * Errors are i18n keys; screens render them via t(error). On login the current
 * user's interface language is applied (default English).
 *
 * Implemented as a vanilla-store factory so it can be unit-tested without React.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AuthService, User } from '../services/auth/authService';
import { isValidPin } from '../services/users/userService';
import { takeAutoLogin, type AppLanguage } from '../i18n/languageStore';

export type AuthStatus = 'no-users' | 'locked' | 'authenticated';

/** Fields entered on the first-launch administrator setup screen. */
export interface AdminSetupInput {
  firstName: string;
  lastName: string;
  language: AppLanguage;
  pin: string;
  pinConfirm: string;
}

export interface AuthState {
  status: AuthStatus;
  /** Provisioned users (for the picker). */
  users: User[];
  current: User | null;
  /** i18n key of the last error, or null. */
  error: string | null;

  /** Resolve the initial status from the persisted user list. */
  init(): void;
  /** Reload the user list (after admin changes). */
  refreshUsers(): void;
  /** First launch: create the administrator and log in. */
  createFirstAdmin(input: AdminSetupInput): boolean;
  /** Log in as the selected user with their PIN. */
  login(userId: string, pin: string): boolean;
  /** Log out (return to the picker). */
  lock(): void;
}

export type AuthStore = StoreApi<AuthState>;

function statusFor(auth: AuthService): AuthStatus {
  return auth.hasUsers() ? 'locked' : 'no-users';
}

/**
 * NOTE: the UI is locked to Hebrew (service-center request), so logging in no
 * longer applies the user's language — see src/i18n/index.ts. The stored
 * per-user language stays in the data model, dormant.
 */

/** Consume the post-restart auto-login marker, restoring the session. */
function restoreAfterRestart(auth: AuthService): User | null {
  const userId = takeAutoLogin();
  return userId === null ? null : auth.restore(userId);
}

export function createAuthStore(auth: AuthService): AuthStore {
  const restored = restoreAfterRestart(auth);
  return createStore<AuthState>((set) => ({
    status: restored !== null ? 'authenticated' : statusFor(auth),
    users: auth.users(),
    current: restored,
    error: null,

    init() {
      set({ status: statusFor(auth), users: auth.users(), current: null, error: null });
    },

    refreshUsers() {
      set({ users: auth.users() });
    },

    createFirstAdmin(input) {
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      if (firstName.length === 0 || lastName.length === 0) {
        set({ error: 'auth.nameRequired' });
        return false;
      }
      if (!isValidPin(input.pin)) {
        set({ error: 'auth.pinFormat' });
        return false;
      }
      if (input.pin !== input.pinConfirm) {
        set({ error: 'auth.pinMismatch' });
        return false;
      }
      const user = auth.addUser({
        firstName,
        lastName,
        role: 'admin',
        language: input.language,
        pin: input.pin,
      });
      auth.login(user.id, input.pin); // set the live session
      set({ status: 'authenticated', current: user, users: auth.users(), error: null });
      return true;
    },

    login(userId, pin) {
      const user = auth.login(userId, pin);
      if (user === null) {
        set({ error: 'auth.wrongPin' });
        return false;
      }
      set({ status: 'authenticated', current: user, error: null });
      return true;
    },

    lock() {
      auth.lock();
      set({ status: statusFor(auth), current: null, users: auth.users(), error: null });
    },
  }));
}

export type { AppLanguage };
