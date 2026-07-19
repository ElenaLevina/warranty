import { createAuthStore } from './authStore';
import { createMmkvAuthService } from '../services/auth/authService';
import { stashAutoLogin, takeAutoLogin } from '../i18n/languageStore';

function harness() {
  const auth = createMmkvAuthService();
  const store = createAuthStore(auth);
  return { auth, store };
}

const ADMIN = { firstName: 'Anna', lastName: 'Admin', language: 'en' as const, pin: '1234', pinConfirm: '1234' };

describe('authStore', () => {
  it('starts with no users', () => {
    const { store } = harness();
    expect(store.getState().status).toBe('no-users');
    expect(store.getState().users).toEqual([]);
  });

  it('validates the admin setup form', () => {
    const { store } = harness();
    // Errors are i18n keys (the screen renders them via t(error)).
    expect(store.getState().createFirstAdmin({ ...ADMIN, firstName: '' })).toBe(false);
    expect(store.getState().error).toBe('auth.nameRequired');

    expect(store.getState().createFirstAdmin({ ...ADMIN, pin: '12', pinConfirm: '12' })).toBe(false);
    expect(store.getState().error).toBe('auth.pinFormat');

    expect(store.getState().createFirstAdmin({ ...ADMIN, pinConfirm: '0000' })).toBe(false);
    expect(store.getState().error).toBe('auth.pinMismatch');

    expect(store.getState().status).toBe('no-users');
  });

  it('creates the first admin and becomes authenticated', () => {
    const { store } = harness();
    expect(store.getState().createFirstAdmin(ADMIN)).toBe(true);
    expect(store.getState().status).toBe('authenticated');
    expect(store.getState().current?.firstName).toBe('Anna');
    expect(store.getState().current?.role).toBe('admin');
  });

  it('locks to the picker and logs in with the correct PIN', () => {
    const { auth, store } = harness();
    store.getState().createFirstAdmin(ADMIN);
    const id = store.getState().current!.id;

    store.getState().lock();
    expect(store.getState().status).toBe('locked');
    expect(store.getState().current).toBeNull();
    expect(store.getState().users.map(u => u.id)).toEqual([id]);

    expect(store.getState().login(id, '0000')).toBe(false);
    expect(store.getState().status).toBe('locked');
    expect(store.getState().error).toBe('auth.wrongPin');

    expect(store.getState().login(id, '1234')).toBe(true);
    expect(store.getState().status).toBe('authenticated');
    expect(auth.current()?.id).toBe(id);
  });
});

describe('authStore — auto-login across the RTL restart', () => {
  it('restores the session from the one-shot marker on startup', () => {
    const { auth, store } = harness();
    store.getState().createFirstAdmin(ADMIN);
    const id = store.getState().current!.id;
    store.getState().lock();

    // Simulate: a PIN login flipped the direction -> marker stashed -> restart.
    stashAutoLogin(id);
    const restarted = createAuthStore(auth);
    expect(restarted.getState().status).toBe('authenticated');
    expect(restarted.getState().current?.id).toBe(id);

    // The marker is one-shot: a following cold start stays locked.
    const coldStart = createAuthStore(auth);
    expect(coldStart.getState().status).toBe('locked');
  });

  it('ignores a stale marker for a deleted user', () => {
    const { auth, store } = harness();
    store.getState().createFirstAdmin(ADMIN);
    stashAutoLogin('user_gone12');
    const restarted = createAuthStore(auth);
    expect(restarted.getState().status).toBe('locked');
    expect(takeAutoLogin()).toBeNull(); // consumed either way
  });
});
