import { expect, test } from '../fixtures/test.js';
import { TINY_CHAPTER_TEXT, TINY_CHAPTER_TITLE, projectIdFromUrl } from '../fixtures/text.js';
import {
  createNamedProject,
  openFindInProject,
  openFirstChapter,
  openFirstProject,
  openProjectSettings,
  openReviewTranslation,
} from '../tasks/workspace.js';
import {
  seesAiReplaceSetup,
  seesAiReplaceUpgrade,
  seesCriticConfirm,
  seesCriticUpgrade,
  seesUnlockedPremiumModels,
} from '../questions/ui.js';

test.describe('AuthorPlus', () => {
  test('creates a project and uses Critic / AI replace UI without submitting', async ({
    authorPlus,
  }) => {
    const name = `e2e-author-plus-${Date.now()}`;
    await authorPlus.attemptsTo(createNamedProject(name));
    const projectId = projectIdFromUrl(authorPlus.page.url());
    const chapter = await authorPlus.api.uploadTxtChapter(
      projectId,
      TINY_CHAPTER_TITLE,
      TINY_CHAPTER_TEXT
    );
    await authorPlus.api.markAsTranslated(projectId, chapter.id);
    await authorPlus.page.reload();

    await authorPlus.attemptsTo(openProjectSettings);
    await authorPlus.see(seesUnlockedPremiumModels);
    await authorPlus.page.keyboard.press('Escape');

    await authorPlus.attemptsTo(openFirstChapter, openReviewTranslation);
    await authorPlus.see(seesCriticConfirm);
    await authorPlus.page.getByRole('button', { name: 'Cancel' }).click();

    await authorPlus.attemptsTo(openFindInProject);
    await authorPlus.page.getByRole('textbox', { name: 'Find' }).fill('wizard');
    const fixWithAi = authorPlus.page.getByRole('button', { name: 'Fix with AI' });
    await expect(fixWithAi).toBeEnabled({ timeout: 20_000 });
    await fixWithAi.click();
    await authorPlus.see(seesAiReplaceSetup);
  });
});

test.describe('Author', () => {
  test('sees upgrade CTAs for Critic and AI replace', async ({ author }) => {
    await author.attemptsTo(openFirstProject, openFirstChapter, openReviewTranslation);
    await author.see(seesCriticUpgrade);
    await author.page.keyboard.press('Escape');

    await author.attemptsTo(openFindInProject);
    const ai = author.page.getByRole('button', { name: 'Fix with AI' });
    await ai.waitFor({ state: 'visible' });
    if (await ai.isEnabled()) {
      await ai.click();
      await author.see(seesAiReplaceUpgrade);
    } else {
      await author.page.getByTitle('Available on Author+').waitFor({ state: 'visible' });
    }
  });
});
