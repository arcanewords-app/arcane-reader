import { test } from '../fixtures/test.js';
import { openProjects, openTranslationRequests } from '../tasks/navigation.js';
import { openFirstChapter, openFirstProject, openProjectReadingMode } from '../tasks/workspace.js';
import {
  layoutMatches,
  seesChapterEditor,
  seesProjectOverview,
  seesProjectsGrid,
  seesReadingMode,
  seesTranslationRequests,
} from '../questions/ui.js';

test.describe('Author visual shells', { tag: '@visual' }, () => {
  test('projects grid', async ({ author }) => {
    await author.attemptsTo(openProjects);
    await author.see(seesProjectsGrid);
    await author.see(layoutMatches('author-projects'));
  });

  test('project overview', async ({ author }) => {
    await author.attemptsTo(openFirstProject);
    await author.see(seesProjectOverview);
    await author.see(layoutMatches('author-project'));
  });

  test('chapter editor', async ({ author }) => {
    await author.attemptsTo(openFirstProject, openFirstChapter);
    await author.see(seesChapterEditor);
    await author.see(layoutMatches('author-chapter'));
  });

  test('reading mode', async ({ author }) => {
    await author.attemptsTo(openFirstProject, openFirstChapter, openProjectReadingMode);
    await author.see(seesReadingMode);
    await author.see(layoutMatches('author-reading'));
  });

  test('translation requests', async ({ author }) => {
    await author.attemptsTo(openTranslationRequests);
    await author.see(seesTranslationRequests);
    await author.see(layoutMatches('author-requests'));
  });
});
