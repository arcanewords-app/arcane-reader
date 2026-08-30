import type { Task } from '../actors/types.js';

export const openFirstPublication: Task = async (actor) => {
  const card = actor.page.getByRole('button', { name: /Open publication:/ }).first();
  await card.waitFor({ state: 'visible' });
  await card.click();
  await actor.page.waitForURL(/\/p\//);
};

export const openFirstTranslatedChapter: Task = async (actor) => {
  const read = actor.page.locator('.publication-page-read-chapter').first();
  await read.waitFor({ state: 'visible', timeout: 20_000 });
  await read.click();
  await actor.page.waitForURL(/\/reading/);
};
