import { test } from '../fixtures/test.js';
import { openProjects } from '../tasks/navigation.js';
import { layoutMatches, seesProjectsGrid } from '../questions/ui.js';

test.describe('Author visual shells', { tag: '@visual' }, () => {
  test('projects grid', async ({ author }) => {
    await author.attemptsTo(openProjects);
    await author.see(seesProjectsGrid);
    await author.see(layoutMatches('author-projects'));
  });
});
