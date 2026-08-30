import { test } from '../fixtures/test.js';
import { openProjects } from '../tasks/navigation.js';
import { layoutMatches, seesUpgradeScreen } from '../questions/ui.js';

test.describe('Reader visual shells', { tag: '@visual' }, () => {
  test('upgrade gate on projects', async ({ reader }) => {
    await reader.attemptsTo(openProjects);
    await reader.see(seesUpgradeScreen);
    await reader.see(layoutMatches('reader-upgrade'));
  });
});
