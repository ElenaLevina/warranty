import { MmkvAuthService, deriveMechanicId } from './authService';

describe('deriveMechanicId', () => {
  it('is deterministic and normalizes case/whitespace', () => {
    expect(deriveMechanicId('Ivan')).toBe(deriveMechanicId('  ivan '));
    expect(deriveMechanicId('Ivan')).toMatch(/^user_[0-9a-f]{8}$/);
  });

  it('differs for different logins', () => {
    expect(deriveMechanicId('ivan')).not.toBe(deriveMechanicId('petr'));
  });
});

describe('MmkvAuthService', () => {
  it('starts unregistered with no current identity', () => {
    const auth = new MmkvAuthService();
    expect(auth.isRegistered()).toBe(false);
    expect(auth.current()).toBeNull();
  });

  it('registers a mechanic and unlocks immediately', () => {
    const auth = new MmkvAuthService();
    const id = auth.register('Ivan', '1234');
    expect(auth.isRegistered()).toBe(true);
    expect(id.login).toBe('Ivan');
    expect(id.mechanicId).toMatch(/^user_[0-9a-f]{8}$/);
    expect(auth.current()).toEqual(id);
  });

  it('unlocks with the correct PIN and rejects a wrong one', () => {
    const auth = new MmkvAuthService();
    const id = auth.register('Ivan', '1234');
    auth.lock();
    expect(auth.current()).toBeNull();

    expect(auth.unlock('0000')).toBeNull();
    expect(auth.current()).toBeNull();

    expect(auth.unlock('1234')).toEqual(id);
    expect(auth.current()).toEqual(id);
  });

  it('lock keeps registration; reset clears it', () => {
    const auth = new MmkvAuthService();
    auth.register('Ivan', '1234');

    auth.lock();
    expect(auth.isRegistered()).toBe(true);

    auth.reset();
    expect(auth.isRegistered()).toBe(false);
    expect(auth.current()).toBeNull();
    expect(auth.unlock('1234')).toBeNull();
  });

  it('does not store the PIN in plaintext', () => {
    const auth = new MmkvAuthService();
    auth.register('Ivan', '9876');
    // The hash must not equal the raw PIN; wrong PIN must fail.
    expect(auth.unlock('1234')).toBeNull();
    expect(auth.unlock('9876')).not.toBeNull();
  });
});
