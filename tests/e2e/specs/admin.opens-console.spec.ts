import { test } from '../fixtures/test.js';
import { openAdminPublications, openAdminUsers } from '../tasks/navigation.js';
import { seesAdminPublications, seesAdminUsers } from '../questions/ui.js';

test.describe('Admin', () => {
  test('opens the admin console on stamped data', async ({ admin }) => {
    await admin.attemptsTo(openAdminUsers);
    await admin.see(seesAdminUsers);
    await admin.attemptsTo(openAdminPublications);
    await admin.see(seesAdminPublications);
  });
});
