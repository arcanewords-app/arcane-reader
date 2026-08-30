import { test } from '../fixtures/test.js';
import {
  openAdminPublications,
  openAdminUsers,
  openProfile,
  openProjects,
} from '../tasks/navigation.js';
import {
  seesAdminDenied,
  seesAdminPublications,
  seesAdminUsers,
  seesEmptyAuthorWorkspace,
  seesProfile,
  seesProjectsGrid,
  seesUpgradeScreen,
} from '../questions/ui.js';

test.describe('access boundaries', () => {
  test('Reader sees upgrade on projects and denied on admin', async ({ reader }) => {
    await reader.attemptsTo(openProfile);
    await reader.see(seesProfile);
    await reader.attemptsTo(openProjects);
    await reader.see(seesUpgradeScreen);
    await reader.attemptsTo(openAdminUsers);
    await reader.see(seesAdminDenied);
  });

  test('Author sees dumped projects and is denied admin', async ({ author }) => {
    await author.attemptsTo(openProjects);
    await author.see(seesProjectsGrid);
    await author.attemptsTo(openAdminUsers);
    await author.see(seesAdminDenied);
  });

  test('AuthorPlus can open an empty workspace', async ({ authorPlus }) => {
    await authorPlus.attemptsTo(openProjects);
    await authorPlus.see(seesEmptyAuthorWorkspace);
  });

  test('Admin opens users and publications', async ({ admin }) => {
    await admin.attemptsTo(openAdminUsers);
    await admin.see(seesAdminUsers);
    await admin.attemptsTo(openAdminPublications);
    await admin.see(seesAdminPublications);
  });
});
