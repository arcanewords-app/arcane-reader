import { test } from '../fixtures/test.js';
import { installNewsLocaleRoutes, NEWS_LOCALE_COPY } from '../fixtures/newsLocale.js';
import { openNews } from '../tasks/navigation.js';
import { chooseLocale, openMockedNewsArticle } from '../tasks/news.js';
import {
  bannerOmits,
  doesNotSeeFallbackNote,
  seesBannerMessage,
  seesFallbackNote,
  seesNewsHeading,
} from '../questions/news.js';

test.describe('Guest', () => {
  test('switches mocked news copy with the app locale', async ({ guest }) => {
    await installNewsLocaleRoutes(guest.page);
    await guest.attemptsTo(openNews);

    await guest.see(seesNewsHeading(NEWS_LOCALE_COPY.en.title));
    await guest.see(seesBannerMessage(NEWS_LOCALE_COPY.en.banner));
    await guest.see(doesNotSeeFallbackNote(NEWS_LOCALE_COPY.en.fallbackLabel));
    await guest.see(bannerOmits(NEWS_LOCALE_COPY.en.fallbackLabel));

    await guest.attemptsTo(
      chooseLocale(NEWS_LOCALE_COPY.en.localeButton, NEWS_LOCALE_COPY.en.russianItem)
    );
    await guest.see(seesNewsHeading(NEWS_LOCALE_COPY.ru.title));
    await guest.see(seesBannerMessage(NEWS_LOCALE_COPY.ru.banner));
    await guest.see(doesNotSeeFallbackNote(NEWS_LOCALE_COPY.ru.fallbackLabel));
    await guest.see(bannerOmits(NEWS_LOCALE_COPY.ru.fallbackLabel));

    await guest.attemptsTo(
      chooseLocale(NEWS_LOCALE_COPY.ru.localeButton, NEWS_LOCALE_COPY.ru.belarusianItem)
    );
    await guest.see(seesNewsHeading(NEWS_LOCALE_COPY.be.title));
    await guest.see(seesBannerMessage(NEWS_LOCALE_COPY.be.banner));
    await guest.see(doesNotSeeFallbackNote(NEWS_LOCALE_COPY.be.fallbackLabel));
    await guest.see(bannerOmits(NEWS_LOCALE_COPY.be.fallbackLabel));

    await guest.attemptsTo(openMockedNewsArticle);
    await guest.see(seesNewsHeading(NEWS_LOCALE_COPY.be.title));
    await guest.see(seesFallbackNote(NEWS_LOCALE_COPY.be.fallbackLabel));

    await guest.attemptsTo(
      chooseLocale(NEWS_LOCALE_COPY.be.localeButton, NEWS_LOCALE_COPY.be.englishItem)
    );
    await guest.see(seesNewsHeading(NEWS_LOCALE_COPY.en.title));
    await guest.see(doesNotSeeFallbackNote(NEWS_LOCALE_COPY.en.fallbackLabel));
  });
});
