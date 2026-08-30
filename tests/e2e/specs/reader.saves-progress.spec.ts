import { test } from '../fixtures/test.js';
import { openCatalog, openProfile } from '../tasks/navigation.js';
import { openFirstTranslatedChapter } from '../tasks/reading.js';
import { catalogHasPublications, readingHistoryHasItem, seesReadingMode } from '../questions/ui.js';

test.describe('Reader', () => {
  test('saves progress on a stamped publication', async ({ reader }) => {
    const found = await reader.api.findReadablePublication();
    await reader.attemptsTo(openCatalog);
    await reader.see(catalogHasPublications);
    await reader.page.goto(`/p/${found.path}`);
    await reader.attemptsTo(openFirstTranslatedChapter);
    await reader.see(seesReadingMode);
    await reader.api.updateReadProgress(found.id, 1);
    await reader.attemptsTo(openProfile);
    await reader.see(readingHistoryHasItem);
  });
});
