import { test } from '../fixtures/test.js';
import {
  openAbout,
  openAccountTiers,
  openCatalog,
  openNews,
  openProjects,
} from '../tasks/navigation.js';
import { openFirstPublication, openFirstTranslatedChapter } from '../tasks/reading.js';
import {
  aboutPageLoaded,
  accountTiersLoaded,
  catalogHasPublications,
  layoutMatches,
  newsPageLoaded,
  publicationPageLoaded,
  seesLoginRequired,
} from '../questions/ui.js';

test.describe('Guest visual shells', { tag: '@visual' }, () => {
  test('catalog', async ({ guest }) => {
    await guest.attemptsTo(openCatalog);
    await guest.see(catalogHasPublications);
    await guest.see(layoutMatches('guest-catalog'));
  });

  test('sign-in modal', async ({ guest }) => {
    await guest.attemptsTo(openCatalog, openProjects);
    await guest.see(seesLoginRequired);
    await guest.see(layoutMatches('guest-sign-in'));
  });

  test('account tiers', async ({ guest }) => {
    await guest.attemptsTo(openAccountTiers);
    await guest.see(accountTiersLoaded);
    await guest.see(layoutMatches('guest-account-tiers'));
  });

  test('publication', async ({ guest }) => {
    await guest.attemptsTo(openCatalog, openFirstPublication);
    await guest.see(publicationPageLoaded);
    await guest.see(layoutMatches('guest-publication'));
  });

  test('reading mode', async ({ guest }) => {
    await guest.attemptsTo(openCatalog, openFirstPublication, openFirstTranslatedChapter);
    await guest.see(layoutMatches('guest-reading'));
  });

  test('news', async ({ guest }) => {
    await guest.attemptsTo(openNews);
    await guest.see(newsPageLoaded);
    await guest.see(layoutMatches('guest-news'));
  });

  test('about', async ({ guest }) => {
    await guest.attemptsTo(openAbout);
    await guest.see(aboutPageLoaded);
    await guest.see(layoutMatches('guest-about'));
  });
});
