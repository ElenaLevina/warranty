/**
 * i18n setup (i18next + react-i18next). Initialized on import (side effect) so
 * useTranslation works everywhere. Default/fallback language is English; the
 * stored preference (or, later, the logged-in user's language) overrides it.
 *
 * RTL handling for he/ar is phase L2.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ru } from './locales/ru';
import { he } from './locales/he';
import { ar } from './locales/ar';
import { getStoredLanguage, storeLanguage, type AppLanguage } from './languageStore';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    he: { translation: he },
    ar: { translation: ar },
  },
  lng: getStoredLanguage() ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Change the UI language and persist it. */
export function setAppLanguage(lng: AppLanguage): void {
  storeLanguage(lng);
  void i18n.changeLanguage(lng);
}

export { APP_LANGUAGES, RTL_LANGUAGES, type AppLanguage } from './languageStore';
export default i18n;
