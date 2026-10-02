import { expect } from '@playwright/test';
import type { Question } from '../actors/types.js';
import { fallbackNote, newsBanner, newsHeadingNamed } from '../targets/news.js';

export function seesNewsHeading(title: string): Question {
  return async (actor) => {
    await expect(newsHeadingNamed(actor.page, title)).toBeVisible();
  };
}

export function seesFallbackNote(label: string): Question {
  return async (actor) => {
    await expect(fallbackNote(actor.page, label)).toBeVisible();
  };
}

export function doesNotSeeFallbackNote(label: string): Question {
  return async (actor) => {
    await expect(fallbackNote(actor.page, label)).toHaveCount(0);
  };
}

export function seesBannerMessage(message: string): Question {
  return async (actor) => {
    await expect(newsBanner(actor.page)).toContainText(message);
  };
}

export function bannerOmits(label: string): Question {
  return async (actor) => {
    await expect(newsBanner(actor.page)).not.toContainText(label);
  };
}
