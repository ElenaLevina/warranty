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
import { storeLanguage, type AppLanguage } from './languageStore';
import { applyDirection } from './rtl';

/**
 * Per service-center request the UI is LOCKED to Hebrew: no language picker,
 * per-user language is ignored. The other translations (en/ru/ar) stay in the
 * codebase dormant — re-enabling the choice is a one-line change here.
 */
const LOCKED_LANGUAGE: AppLanguage = 'he';
const initialLanguage = LOCKED_LANGUAGE;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    he: { translation: he },
    ar: { translation: ar },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Align native layout direction with the stored language on startup (may
// trigger a one-time restart the first time an RTL language is in effect).
applyDirection(initialLanguage);

/** Change the UI language and persist it. Flips RTL/LTR (restart) if needed. */
export function setAppLanguage(lng: AppLanguage): void {
  storeLanguage(lng);
  void i18n.changeLanguage(lng);
  applyDirection(lng); // restarts the app when the direction changes
}

export { APP_LANGUAGES, RTL_LANGUAGES, type AppLanguage } from './languageStore';
export default i18n;
