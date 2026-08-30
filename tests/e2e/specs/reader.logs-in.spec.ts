import { test } from '../fixtures/test.js';
import { openCatalog, openProfile } from '../tasks/navigation.js';
import { loginAsReaderViaUi, logout } from '../tasks/catalog.js';
import { seesGuestHeader, seesLoggedInHeader, seesProfile } from '../questions/ui.js';

test.describe('Reader', () => {
  test('logs in and out from the catalog', async ({ guest }) => {
    await guest.attemptsTo(openCatalog);
    await guest.see(seesGuestHeader);
    await guest.attemptsTo(loginAsReaderViaUi);
    await guest.see(seesLoggedInHeader);
    await guest.attemptsTo(openProfile);
    await guest.see(seesProfile);
    await guest.attemptsTo(logout);
    await guest.see(seesGuestHeader);
  });
});
