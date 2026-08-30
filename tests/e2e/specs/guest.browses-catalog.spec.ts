import { test } from '../fixtures/test.js';
import { openAccountTiers, openCatalog, openNews, openProjects } from '../tasks/navigation.js';
import { openFirstPublication } from '../tasks/reading.js';
import {
  accountTiersLoaded,
  catalogHasPublications,
  newsPageLoaded,
  publicationPageLoaded,
  seesLoginRequired,
} from '../questions/ui.js';

test.describe('Guest', () => {
  test('browses catalog and opens a stamped publication', async ({ guest }) => {
    await guest.attemptsTo(openCatalog);
    await guest.see(catalogHasPublications);
    await guest.attemptsTo(openFirstPublication);
    await guest.see(publicationPageLoaded);
  });

  test('opens news and account tiers', async ({ guest }) => {
    await guest.attemptsTo(openNews);
    await guest.see(newsPageLoaded);
    await guest.attemptsTo(openAccountTiers);
    await guest.see(accountTiersLoaded);
  });

  test('is asked to sign in on /projects', async ({ guest }) => {
    await guest.attemptsTo(openProjects);
    await guest.see(seesLoginRequired);
  });
});
