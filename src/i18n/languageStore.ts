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
