import type { Task } from '../actors/types.js';
import { publicationCard } from '../targets/catalog.js';
import { publicationReadChapter } from '../targets/reading.js';

export const openFirstPublication: Task = async (actor) => {
  const card = publicationCard(actor.page).first();
  await card.waitFor({ state: 'visible' });
  await card.click();
  await actor.page.waitForURL(/\/p\//);
};

export const openFirstTranslatedChapter: Task = async (actor) => {
  const read = publicationReadChapter(actor.page).first();
  await read.waitFor({ state: 'visible', timeout: 20_000 });
  await read.click();
  await actor.page.waitForURL(/\/reading/);
};
