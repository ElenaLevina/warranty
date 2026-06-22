/**
 * AuthService — local-only authentication over an admin-provisioned user list.
 *
 * Model (per product decision):
 *  - An administrator maintains the user list (UserService): first/last name,
 *    role (admin | mechanic), interface language, PIN.
 *  - First launch (no users): create the first administrator.
 *  - Login: pick a user from the list and enter the PIN the admin assigned.
 *  - The logged-in user's `id` is stored into session.json as mechanic_id, so
 *    cases stay isolated per user (filtered in FilesService.listOpenSessions).
 *
 * This service is a thin session facade over UserService: it delegates the
 * user-list operations and additionally holds the currently logged-in user.
 */
import { MmkvUserService, type User, type UserInput, type UserService } from '../users/userService';

export type { User, UserInput, UserRole } from '../users/userService';

export interface AuthService {
  /** All provisioned users (without secrets), for the picker / admin screen. */
  users(): User[];
  /** True if at least one user has been provisioned. */
  hasUsers(): boolean;
  /** Provision a new user (admin). */
  addUser(input: UserInput): User;
  /** Edit a user (admin). */
  updateUser(id: string, input: UserInput): User | null;
  /** Remove a user (admin). */
  removeUser(id: string): void;
  /** Log in: verify the user's PIN and set the current session on success. */
  login(userId: string, pin: string): User | null;
  /** Currently logged-in user, or null when locked. */
  current(): User | null;
  /** Log out (clear the in-memory session; keeps the user list). */
  lock(): void;
}

export class LocalAuthService implements AuthService {
  private session: User | null = null;

  constructor(private readonly userService: UserService) {}

  users(): User[] {
    return this.userService.list();
  }

  hasUsers(): boolean {
    return this.userService.hasUsers();
  }

  addUser(input: UserInput): User {
    return this.userService.add(input);
  }

  updateUser(id: string, input: UserInput): User | null {
    const updated = this.userService.update(id, input);
    // Keep the live session in sync if the current user was edited.
    if (updated !== null && this.session?.id === id) {
      this.session = updated;
    }
    return updated;
  }

  removeUser(id: string): void {
    this.userService.remove(id);
    if (this.session?.id === id) {
      this.session = null;
    }
  }

  login(userId: string, pin: string): User | null {
    const user = this.userService.verifyPin(userId, pin);
    if (user !== null) {
      this.session = user;
    }
    return user;
  }

  current(): User | null {
    return this.session;
  }

  lock(): void {
    this.session = null;
  }
}

/** Build a LocalAuthService backed by encrypted MMKV storage. */
export function createMmkvAuthService(encryptionKey?: string): AuthService {
  return new LocalAuthService(new MmkvUserService(encryptionKey));
}
