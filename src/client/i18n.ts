/**
 * i18n setup for app UI localization.
 * Default language: English (en). Supported: ru, en, pl.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const APP_LOCALE_KEY = 'app.locale';
export type AppLocale = 'ru' | 'en' | 'pl';
export const SUPPORTED_LOCALES: AppLocale[] = ['ru', 'en', 'pl'];

function getSavedLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(APP_LOCALE_KEY);
  if (saved && SUPPORTED_LOCALES.includes(saved as AppLocale)) {
    return saved as AppLocale;
  }
  return 'en';
}

export function setSavedLocale(locale: AppLocale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APP_LOCALE_KEY, locale);
  i18n.changeLanguage(locale);
}

export function getSavedLocaleSync(): AppLocale {
  return getSavedLocale();
}

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    pl: { translation: pl },
  },
  lng: getSavedLocale(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
