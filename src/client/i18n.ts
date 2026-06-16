/**
 * i18n setup for app UI localization.
 * Default language: Russian (ru). Supported app locales: ru, en, be.
 * Resolution order: localStorage (explicit choice) → browser languages → ru.
 */

// eslint-disable-next-line import/no-named-as-default-member -- we use default i18n instance
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';
import en from './locales/en.json';
import be from './locales/be.json';

export const APP_LOCALE_KEY = 'app.locale';
export type AppLocale = 'ru' | 'en' | 'be';
export const SUPPORTED_LOCALES: AppLocale[] = ['ru', 'en', 'be'];

function syncHtmlLang(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

function resolveBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'ru';
  const codes =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  for (const raw of codes) {
    if (!raw) continue;
    const base = raw.split('-')[0].toLowerCase();
    if (base === 'ru' || base === 'en' || base === 'be') return base;
  }
  return 'ru';
}

function getInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return 'ru';
  const saved = localStorage.getItem(APP_LOCALE_KEY);
  if (saved === 'pl') {
    localStorage.setItem(APP_LOCALE_KEY, 'en');
    return 'en';
  }
  if (saved && SUPPORTED_LOCALES.includes(saved as AppLocale)) {
    return saved as AppLocale;
  }
  return resolveBrowserLocale();
}

export function setSavedLocale(locale: AppLocale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APP_LOCALE_KEY, locale);
  syncHtmlLang(locale);
  // eslint-disable-next-line import/no-named-as-default-member -- default instance is intended
  i18n.changeLanguage(locale);
}

export function getSavedLocaleSync(): AppLocale {
  return getInitialLocale();
}

const initialLocale = getInitialLocale();
syncHtmlLang(initialLocale);

// eslint-disable-next-line import/no-named-as-default-member -- i18n.use() is the intended API
i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    be: { translation: be },
  },
  lng: initialLocale,
  fallbackLng: 'ru',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
