import { test } from '../fixtures/test.js';
import { openAdminUsers } from '../tasks/navigation.js';
import { layoutMatches, seesAdminUsers } from '../questions/ui.js';

test.describe('Admin visual shells', { tag: '@visual' }, () => {
  test('users console', async ({ admin }) => {
    await admin.attemptsTo(openAdminUsers);
    await admin.see(seesAdminUsers);
    await admin.see(layoutMatches('admin-users'));
  });
});
