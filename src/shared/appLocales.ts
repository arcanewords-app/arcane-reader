/** App UI locales. News content uses the same set; Russian is the canonical post language. */
export const APP_LOCALES = ['ru', 'en', 'be', 'pl'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const PRIMARY_CONTENT_LOCALE: AppLocale = 'ru';

/** Locales stored in jsonb. The primary language stays in table columns. */
export const NEWS_TRANSLATION_LOCALES = ['en', 'be', 'pl'] as const;
export type NewsTranslationLocale = (typeof NEWS_TRANSLATION_LOCALES)[number];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}
