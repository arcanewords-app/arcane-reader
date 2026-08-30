import { test } from '../fixtures/test.js';
import { openAccountTiers, openCatalog, openProjects } from '../tasks/navigation.js';
import {
  accountTiersLoaded,
  catalogHasPublications,
  layoutMatches,
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
});
