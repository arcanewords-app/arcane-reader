import { test } from '../fixtures/test.js';
import { openCatalog } from '../tasks/navigation.js';
import {
  openFirstPublication,
  openFirstTranslatedChapter,
  openReadingSettings,
} from '../tasks/reading.js';
import {
  catalogHasPublications,
  readerContainerWidthChangesText,
  seesReadingMode,
} from '../questions/ui.js';

test.describe('Guest', () => {
  test('changes reading container width', async ({ guest }) => {
    await guest.attemptsTo(openCatalog);
    await guest.see(catalogHasPublications);
    await guest.attemptsTo(openFirstPublication, openFirstTranslatedChapter);
    await guest.see(seesReadingMode);
    await guest.attemptsTo(openReadingSettings);
    await guest.see(readerContainerWidthChangesText);
  });
});
