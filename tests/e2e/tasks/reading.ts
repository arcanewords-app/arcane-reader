import type { Task } from '../actors/types.js';
import { publicationCard } from '../targets/catalog.js';
import {
  containerWidthSlider,
  publicationReadChapter,
  readingModeSettings,
} from '../targets/reading.js';

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

export const openReadingSettings: Task = async (actor) => {
  await readingModeSettings(actor.page).click();
  await containerWidthSlider(actor.page).waitFor({ state: 'visible' });
};
