import { test } from '../fixtures/test.js';
import { openCatalog } from '../tasks/navigation.js';
import { openFirstPublication } from '../tasks/reading.js';
import { openFirstChapter, openFirstProject } from '../tasks/workspace.js';
import {
  catalogHasPublications,
  layoutMatches,
  publicationPageLoaded,
  seesChapterEditor,
  seesProjectOverview,
} from '../questions/ui.js';

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

  test('project overview', async ({ authorLight }) => {
    await authorLight.attemptsTo(openFirstProject);
    await authorLight.see(seesProjectOverview);
    await authorLight.see(layoutMatches('author-project-light'));
  });

  test('chapter editor', async ({ authorLight }) => {
    await authorLight.attemptsTo(openFirstProject, openFirstChapter);
    await authorLight.see(seesChapterEditor);
    await authorLight.see(layoutMatches('author-chapter-light'));
  });
});
