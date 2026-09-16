import { test } from '../fixtures/test.js';
import { openAdminUsers, openTranslationRequests } from '../tasks/navigation.js';
import { enableRequestModeration } from '../tasks/workspace.js';
import {
  layoutMatches,
  seesAdminUsers,
  seesRequestModeration,
  seesTranslationRequests,
} from '../questions/ui.js';

test.describe('Admin visual shells', { tag: '@visual' }, () => {
  test('users console', async ({ admin }) => {
    await admin.attemptsTo(openAdminUsers);
    await admin.see(seesAdminUsers);
    await admin.see(layoutMatches('admin-users'));
  });

  test('translation requests moderation', async ({ admin }) => {
    await admin.attemptsTo(openTranslationRequests, enableRequestModeration);
    await admin.see(seesTranslationRequests);
    await admin.see(seesRequestModeration);
    await admin.see(layoutMatches('admin-requests'));
  });
});
