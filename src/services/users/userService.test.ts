import { MmkvUserService, isValidPin, type UserInput } from './userService';

function admin(over: Partial<UserInput> = {}): UserInput {
  return { firstName: 'Anna', lastName: 'Admin', role: 'admin', language: 'en', pin: '1234', ...over };
}
function mechanic(over: Partial<UserInput> = {}): UserInput {
  return { firstName: 'Ivan', lastName: 'Petrov', role: 'mechanic', language: 'ru', pin: '5678', ...over };
}

describe('UserService', () => {
  it('starts empty', () => {
    const s = new MmkvUserService();
    expect(s.hasUsers()).toBe(false);
    expect(s.hasAdmin()).toBe(false);
    expect(s.list()).toEqual([]);
  });

  it('provisions a user and exposes no secret material', () => {
    const s = new MmkvUserService();
    const u = s.add(admin());
    expect(s.hasUsers()).toBe(true);
    expect(s.hasAdmin()).toBe(true);
    expect(u.id).toMatch(/^user_[0-9a-f]{8}$/);
    expect(u).toEqual({ id: u.id, firstName: 'Anna', lastName: 'Admin', role: 'admin', language: 'en' });
    expect(Object.keys(u)).not.toContain('pinHash');
    expect(Object.keys(u)).not.toContain('pinSalt');
  });

  it('rejects an invalid PIN on create', () => {
    const s = new MmkvUserService();
    expect(() => s.add(admin({ pin: '12' }))).toThrow(/PIN/);
    expect(() => s.add(admin({ pin: 'abcd' }))).toThrow(/PIN/);
    expect(s.hasUsers()).toBe(false);
  });

  it('verifies the PIN for login', () => {
    const s = new MmkvUserService();
    const u = s.add(mechanic());
    expect(s.verifyPin(u.id, '0000')).toBeNull();
    expect(s.verifyPin(u.id, '5678')?.id).toBe(u.id);
    expect(s.verifyPin('user_unknown', '5678')).toBeNull();
  });

  it('updates fields and optionally resets the PIN', () => {
    const s = new MmkvUserService();
    const u = s.add(mechanic());

    // Empty pin keeps the existing one; fields change.
    const edited = s.update(u.id, mechanic({ firstName: 'Ivan', lastName: 'Sidorov', pin: '' }));
    expect(edited?.lastName).toBe('Sidorov');
    expect(s.verifyPin(u.id, '5678')?.id).toBe(u.id);

    // Non-empty pin resets it.
    s.update(u.id, mechanic({ pin: '4321' }));
    expect(s.verifyPin(u.id, '5678')).toBeNull();
    expect(s.verifyPin(u.id, '4321')?.id).toBe(u.id);
  });

  it('returns null when updating a missing user', () => {
    const s = new MmkvUserService();
    expect(s.update('nope', mechanic())).toBeNull();
  });

  it('keeps at least one admin', () => {
    const s = new MmkvUserService();
    const a = s.add(admin());

    // Cannot remove the only admin.
    expect(() => s.remove(a.id)).toThrow(/admin/i);
    // Cannot demote the only admin.
    expect(() => s.update(a.id, admin({ role: 'mechanic' }))).toThrow(/admin/i);

    // With a second admin, the first can be removed.
    const b = s.add(admin({ firstName: 'Boris' }));
    expect(() => s.remove(a.id)).not.toThrow();
    expect(s.list().map(u => u.id)).toEqual([b.id]);
  });

  it('removes a mechanic freely', () => {
    const s = new MmkvUserService();
    s.add(admin());
    const m = s.add(mechanic());
    s.remove(m.id);
    expect(s.list().some(u => u.id === m.id)).toBe(false);
    expect(s.hasAdmin()).toBe(true);
  });
});

describe('isValidPin', () => {
  it('accepts 4-6 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});
