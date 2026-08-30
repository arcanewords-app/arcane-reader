import { test } from '../fixtures/test.js';
import { openProjects } from '../tasks/navigation.js';
import { layoutMatches, seesEmptyAuthorWorkspace } from '../questions/ui.js';

test.describe('AuthorPlus visual shells', { tag: '@visual' }, () => {
  test('empty workspace', async ({ authorPlus }) => {
    await authorPlus.attemptsTo(openProjects);
    await authorPlus.see(seesEmptyAuthorWorkspace);
    await authorPlus.see(layoutMatches('authorplus-empty'));
  });
});
