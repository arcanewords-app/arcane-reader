import { test } from '../fixtures/test.js';
import { openCatalog } from '../tasks/navigation.js';
import { openFirstPublication } from '../tasks/reading.js';
import { catalogHasPublications, layoutMatches, publicationPageLoaded } from '../questions/ui.js';

test.describe('Light theme visual shells', { tag: '@visual' }, () => {
  test('catalog', async ({ guestLight }) => {
    await guestLight.attemptsTo(openCatalog);
    await guestLight.see(catalogHasPublications);
    await guestLight.see(layoutMatches('guest-catalog-light'));
  });

  test('publication', async ({ guestLight }) => {
    await guestLight.attemptsTo(openCatalog, openFirstPublication);
    await guestLight.see(publicationPageLoaded);
    await guestLight.see(layoutMatches('guest-publication-light'));
  });
});
