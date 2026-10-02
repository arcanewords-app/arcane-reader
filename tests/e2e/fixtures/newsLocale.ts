import type { Page, Route } from '@playwright/test';

/** Fixed copy so a guest can switch locale without stamp news translations. */
export const NEWS_LOCALE_SLUG = 'locale-switch-demo';

export const NEWS_LOCALE_COPY = {
  en: {
    title: 'English release note',
    summary: 'English summary of the release.',
    body: 'English article body.',
    banner: 'English banner',
    fellBack: false,
    fallbackLabel: 'Shown in Russian',
    localeButton: 'English',
    russianItem: 'RU — Russian',
  },
  ru: {
    title: 'Русская заметка',
    summary: 'Русское описание релиза.',
    body: 'Русский текст статьи.',
    banner: 'Русский баннер',
    fellBack: false,
    fallbackLabel: 'Показано на русском',
    localeButton: 'Русский',
    belarusianItem: 'BE — Беларусский',
  },
  be: {
    title: 'Русская заметка',
    summary: 'Русское описание релиза.',
    body: 'Русский текст статьи.',
    banner: 'Русский баннер',
    fellBack: true,
    fallbackLabel: 'Паказана па-руску',
    localeButton: 'Беларуская',
    englishItem: 'EN — English',
  },
} as const;

type LocaleKey = keyof typeof NEWS_LOCALE_COPY;

function localeFrom(url: URL): LocaleKey {
  const value = url.searchParams.get('locale');
  if (value === 'en' || value === 'ru' || value === 'be') return value;
  return 'ru';
}

function newsPayload(locale: LocaleKey, detail: boolean) {
  const copy = NEWS_LOCALE_COPY[locale];
  return {
    id: 'news-locale-1',
    slug: NEWS_LOCALE_SLUG,
    title: copy.title,
    summary: copy.summary,
    body: detail ? copy.body : '',
    category: 'update',
    status: 'published',
    publishedAt: '2026-06-01T00:00:00.000Z',
    fellBack: copy.fellBack,
    resolvedLocale: copy.fellBack ? 'ru' : locale,
  };
}

async function fulfillNews(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  const locale = localeFrom(url);
  const detail = !url.pathname.endsWith('/api/news');
  const payload = newsPayload(locale, detail);
  await route.fulfill({ json: detail ? payload : [payload] });
}

async function fulfillAnnouncement(route: Route): Promise<void> {
  const locale = localeFrom(new URL(route.request().url()));
  const copy = NEWS_LOCALE_COPY[locale];
  await route.fulfill({
    json: {
      id: 'news-locale-banner',
      message: copy.banner,
      ctaLabel: null,
      ctaUrl: `/news/${NEWS_LOCALE_SLUG}`,
      newsPostId: 'news-locale-1',
      variant: 'info',
      contentVersion: 1,
      dismissible: true,
      fellBack: copy.fellBack,
    },
  });
}

/** Intercept only the public news feed and the active banner. */
export async function installNewsLocaleRoutes(page: Page): Promise<void> {
  await page.route('**/api/news**', fulfillNews);
  await page.route('**/api/announcements/active**', fulfillAnnouncement);
}
