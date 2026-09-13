import { test } from '../fixtures/test.js';
import { TINY_CHAPTER_TEXT, TINY_CHAPTER_TITLE, projectIdFromUrl } from '../fixtures/text.js';
import {
  clickFixWithAi,
  createNamedProject,
  dismissCloseButton,
  dismissModal,
  openFindInProject,
  openFirstChapter,
  openFirstProject,
  openProjectSettings,
  openReviewTranslation,
  searchInProject,
  tryOpenAiReplace,
} from '../tasks/workspace.js';
import {
  seesAiReplaceSetup,
  seesAiReplaceUpgradeOrHint,
  seesCriticConfirm,
  seesCriticUpgrade,
  seesFixWithAiEnabled,
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
    await authorPlus.attemptsTo(dismissModal);

    await authorPlus.attemptsTo(openFindInProject, searchInProject('wizard'));
    await authorPlus.see(seesFixWithAiEnabled);
    await authorPlus.attemptsTo(clickFixWithAi);
    await authorPlus.see(seesAiReplaceSetup);
  });
});

test.describe('Author', () => {
  test('sees upgrade CTAs for Critic and AI replace', async ({ author }) => {
    await author.attemptsTo(openFirstProject, openFirstChapter, openReviewTranslation);
    await author.see(seesCriticUpgrade);
    await author.attemptsTo(dismissCloseButton);

    await author.attemptsTo(openFindInProject, tryOpenAiReplace);
    await author.see(seesAiReplaceUpgradeOrHint);
  });
});
