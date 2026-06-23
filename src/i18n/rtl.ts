/**
 * RTL handling for Hebrew/Arabic. React Native applies the layout direction
 * (mirroring) only after a reload, so when the direction flips we force it and
 * restart the app. Text content updates live via i18next; only the layout
 * direction needs the restart.
 */
import { I18nManager } from 'react-native';
import RNRestart from 'react-native-restart';
import { RTL_LANGUAGES, type AppLanguage } from './languageStore';

export function isRtlLanguage(lng: AppLanguage): boolean {
  return RTL_LANGUAGES.includes(lng);
}

/**
 * Align the native layout direction with the language. Returns true if a
 * restart was triggered (direction changed).
 */
export function applyDirection(lng: AppLanguage): boolean {
  const rtl = isRtlLanguage(lng);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) {
    return false;
  }
  I18nManager.forceRTL(rtl);
  try {
    RNRestart.restart();
  } catch {
    // Native restart unavailable (tests / dev without a rebuild): the new
    // direction takes effect on the next manual app launch.
  }
  return true;
}
