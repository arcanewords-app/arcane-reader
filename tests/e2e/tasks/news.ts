import type { Task } from '../actors/types.js';
import { localeButton, localeMenuItem } from '../targets/news.js';
import { NEWS_LOCALE_SLUG } from '../fixtures/newsLocale.js';

export const openMockedNewsArticle: Task = async (actor) => {
  await actor.page.getByRole('link', { name: /English release note|Русская заметка/ }).click();
  await actor.page.waitForURL(new RegExp(`/news/${NEWS_LOCALE_SLUG}$`));
};

export const chooseLocale =
  (buttonName: string, itemName: string): Task =>
  async (actor) => {
    await localeButton(actor.page, buttonName).click();
    await localeMenuItem(actor.page, itemName).click();
  };
