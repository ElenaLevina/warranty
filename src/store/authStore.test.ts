import { createAuthStore } from './authStore';
import { MmkvAuthService } from '../services/auth/authService';

function harness() {
  const auth = new MmkvAuthService();
  const store = createAuthStore(auth);
  return { auth, store };
}

describe('authStore', () => {
  it('starts unregistered', () => {
    const { store } = harness();
    expect(store.getState().status).toBe('unregistered');
  });

  it('validates the registration form', () => {
    const { store } = harness();
    expect(store.getState().register('', '1234', '1234')).toBe(false);
    expect(store.getState().error).toMatch(/логин/i);

    expect(store.getState().register('Ivan', '12', '12')).toBe(false);
    expect(store.getState().error).toMatch(/4.6 цифр|4–6/);

    expect(store.getState().register('Ivan', '1234', '0000')).toBe(false);
    expect(store.getState().error).toMatch(/совпад/i);
  });

  it('registers and becomes authenticated', () => {
    const { store } = harness();
    expect(store.getState().register('Ivan', '1234', '1234')).toBe(true);
    expect(store.getState().status).toBe('authenticated');
    expect(store.getState().current?.login).toBe('Ivan');
  });

  it('locks then unlocks with the correct PIN', () => {
    const { store } = harness();
    store.getState().register('Ivan', '1234', '1234');

    store.getState().lock();
    expect(store.getState().status).toBe('locked');
    expect(store.getState().current).toBeNull();

    expect(store.getState().unlock('0000')).toBe(false);
    expect(store.getState().status).toBe('locked');
    expect(store.getState().error).toMatch(/неверный/i);

    expect(store.getState().unlock('1234')).toBe(true);
    expect(store.getState().status).toBe('authenticated');
  });

  it('switchUser clears registration back to unregistered', () => {
    const { store } = harness();
    store.getState().register('Ivan', '1234', '1234');
    store.getState().switchUser();
    expect(store.getState().status).toBe('unregistered');
    expect(store.getState().current).toBeNull();
    expect(store.getState().registeredLogin).toBeNull();
  });

  it('exposes the registered login for the lock screen', () => {
    const { store } = harness();
    store.getState().register('Ivan', '1234', '1234');
    store.getState().lock();
    // login stays visible while locked, identity is cleared
    expect(store.getState().current).toBeNull();
    expect(store.getState().registeredLogin).toBe('Ivan');
  });
});
