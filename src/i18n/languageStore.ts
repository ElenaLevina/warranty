import { MMKV } from 'react-native-mmkv';

export type AppLanguage = 'en' | 'ru' | 'he' | 'ar';
export const APP_LANGUAGES: AppLanguage[] = ['en', 'ru', 'he', 'ar'];

/** Languages that read right-to-left (used for RTL handling in phase L2). */
export const RTL_LANGUAGES: AppLanguage[] = ['he', 'ar'];

const store = new MMKV({ id: 'warranty-i18n' });
const KEY = 'language';

function isAppLanguage(v: string | undefined): v is AppLanguage {
  return v === 'en' || v === 'ru' || v === 'he' || v === 'ar';
}

export function getStoredLanguage(): AppLanguage | null {
  const v = store.getString(KEY);
  return isAppLanguage(v) ? v : null;
}

export function storeLanguage(lng: AppLanguage): void {
  store.set(KEY, lng);
}

const KEY_AUTO_LOGIN = 'autoLoginUserId';

/**
 * One-shot auto-login across the RTL restart. Written ONLY right after a
 * successful PIN entry whose language flips the layout direction (the restart
 * would otherwise drop the in-memory session and bounce the user back to the
 * picker). Consumed (and cleared) once on the next startup.
 */
export function stashAutoLogin(userId: string): void {
  store.set(KEY_AUTO_LOGIN, userId);
}

export function takeAutoLogin(): string | null {
  const v = store.getString(KEY_AUTO_LOGIN);
  if (v !== undefined) {
    store.delete(KEY_AUTO_LOGIN);
  }
  return v ?? null;
}
