import { test, expect } from '../fixtures/test.js';
import { TINY_CHAPTER_TEXT, TINY_CHAPTER_TITLE } from '../fixtures/text.js';
import { openFirstProject } from '../tasks/workspace.js';
import { chapterItem } from '../targets/workspace.js';

test.describe('Author', () => {
  test('translates a tiny additive chapter', { tag: '@llm' }, async ({ author }) => {
    test.skip(!process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is not set');
    test.setTimeout(180_000);

    const projects = await author.api.listProjects();
    const project = projects[0];
    expect(project).toBeTruthy();
    const projectId = project!.id;

    const chapter = await author.api.uploadTxtChapter(
      projectId,
      TINY_CHAPTER_TITLE,
      TINY_CHAPTER_TEXT
    );
    await author.api.translateChapter(projectId, chapter.id);

    const saved = await author.api.getChapter(projectId, chapter.id);
    const translated = (saved.paragraphs ?? []).some(
      (p) => typeof p.translatedText === 'string' && p.translatedText.trim().length > 0
    );
    expect(translated, 'translated text should be present').toBe(true);
    expect(saved.status === 'pending').toBe(false);

    await author.attemptsTo(openFirstProject);
    await author.page.goto(`/projects/${projectId}/chapters/${chapter.id}`);
    await expect(chapterItem(author.page).first()).toBeVisible();
    await expect(author.page.getByText(/wizard|башн|волшеб/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
