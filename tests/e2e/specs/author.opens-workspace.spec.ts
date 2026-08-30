import { test } from '../fixtures/test.js';
import { openProjects } from '../tasks/navigation.js';
import {
  openFirstChapter,
  openFirstProject,
  openGlossary,
  openProjectReadingMode,
  openProjectSettings,
} from '../tasks/workspace.js';
import {
  seesGlossary,
  seesProjectsGrid,
  seesReadingMode,
  seesTokenCredits,
  seesBasicModelLock,
} from '../questions/ui.js';

test.describe('Author', () => {
  test('opens a dumped project, glossary, chapter, and reading mode', async ({ author }) => {
    await author.attemptsTo(openProjects);
    await author.see(seesProjectsGrid);
    await author.see(seesTokenCredits);
    await author.attemptsTo(openFirstProject);
    await author.attemptsTo(openGlossary);
    await author.see(seesGlossary);
    await author.page.keyboard.press('Escape');
    await author.attemptsTo(openFirstChapter);
    await author.attemptsTo(openProjectReadingMode);
    await author.see(seesReadingMode);
  });

  test('has premium translate models locked', async ({ author }) => {
    await author.attemptsTo(openFirstProject, openProjectSettings);
    await author.see(seesBasicModelLock);
  });
});
