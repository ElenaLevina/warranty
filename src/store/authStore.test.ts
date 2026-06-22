import { createAuthStore } from './authStore';
import { createMmkvAuthService } from '../services/auth/authService';

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
