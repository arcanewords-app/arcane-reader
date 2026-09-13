import { test } from '../fixtures/test.js';
import { openProfile, openProjects } from '../tasks/navigation.js';
import { layoutMatches, seesProfile, seesUpgradeScreen } from '../questions/ui.js';

test.describe('Reader visual shells', { tag: '@visual' }, () => {
  test('upgrade gate on projects', async ({ reader }) => {
    await reader.attemptsTo(openProjects);
    await reader.see(seesUpgradeScreen);
    await reader.see(layoutMatches('reader-upgrade'));
  });

  test('profile', async ({ reader }) => {
    await reader.attemptsTo(openProfile);
    await reader.see(seesProfile);
    await reader.see(layoutMatches('reader-profile'));
  });
});
