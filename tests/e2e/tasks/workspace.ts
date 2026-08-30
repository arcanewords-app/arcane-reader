import type { Task } from '../actors/types.js';

export const openFirstProject: Task = async (actor) => {
  await actor.page.goto('/projects');
  const card = actor.page.locator('.project-card').first();
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  await card.click();
  await actor.page.waitForURL(/\/projects\/[0-9a-f-]+/i);
};

export const openGlossary: Task = async (actor) => {
  await actor.page.getByRole('button', { name: /Glossary/ }).click();
  await actor.page.getByRole('heading', { name: 'Glossary' }).waitFor({ state: 'visible' });
};

export const openFirstChapter: Task = async (actor) => {
  const item = actor.page.locator('.chapter-item').first();
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
  await actor.page.waitForURL(/\/chapters\//);
};

export const openProjectReadingMode: Task = async (actor) => {
  await actor.page.getByTitle('Reading mode').click();
  await actor.page.waitForURL(/\/reading/);
};

export const openReviewTranslation: Task = async (actor) => {
  await openChapterActions(actor);
  await actor.page.getByRole('menuitem', { name: 'Review translation' }).click();
};

export const openProjectSettings: Task = async (actor) => {
  await actor.page.getByRole('button', { name: 'Project settings' }).click();
  await actor.page.getByRole('heading', { name: 'Project settings' }).waitFor({ state: 'visible' });
};

export const openFindInProject: Task = async (actor) => {
  await actor.page.getByRole('button', { name: 'Find in project' }).click();
  await actor.page.getByRole('heading', { name: 'Find in project' }).waitFor({ state: 'visible' });
};

export const openChapterActions: Task = async (actor) => {
  await actor.page.getByRole('button', { name: 'Chapter actions' }).click();
};

export const createNamedProject =
  (name: string): Task =>
  async (actor) => {
    await actor.page.goto('/projects');
    await actor.page.getByRole('button', { name: 'New project' }).click();
    await actor.page.getByRole('heading', { name: 'New project' }).waitFor({ state: 'visible' });
    await actor.page.getByPlaceholder('e.g. Lord of the Rings').fill(name);
    await actor.page.getByRole('button', { name: 'Create' }).click();
    await actor.page.waitForURL(/\/projects\/[0-9a-f-]+/i, { timeout: 20_000 });
  };
