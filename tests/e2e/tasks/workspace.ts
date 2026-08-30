import { expect } from '@playwright/test';
import type { Task } from '../actors/types.js';
import { modalCancel } from '../targets/auth.js';
import {
  chapterActions,
  chapterItem,
  chapterReadingMode,
  createProjectButton,
  findInProject,
  findInProjectHeading,
  fixWithAi,
  glossaryButton,
  glossaryHeading,
  newProjectButton,
  newProjectHeading,
  projectCard,
  projectNameField,
  projectSearchFind,
  projectSettings,
  projectSettingsHeading,
  reviewTranslation,
} from '../targets/workspace.js';

export const openFirstProject: Task = async (actor) => {
  await actor.page.goto('/projects');
  const card = projectCard(actor.page).first();
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  await card.click();
  await actor.page.waitForURL(/\/projects\/[0-9a-f-]+/i);
};

export const openGlossary: Task = async (actor) => {
  await glossaryButton(actor.page).click();
  await glossaryHeading(actor.page).waitFor({ state: 'visible' });
};

export const openFirstChapter: Task = async (actor) => {
  const item = chapterItem(actor.page).first();
  await item.waitFor({ state: 'visible', timeout: 20_000 });
  await item.click();
  await actor.page.waitForURL(/\/chapters\//);
};

export const openProjectReadingMode: Task = async (actor) => {
  await chapterReadingMode(actor.page).click();
  await actor.page.waitForURL(/\/reading/);
};

export const openChapterActions: Task = async (actor) => {
  await chapterActions(actor.page).click();
};

export const openReviewTranslation: Task = async (actor) => {
  await openChapterActions(actor);
  await reviewTranslation(actor.page).click();
};

export const dismissModal: Task = async (actor) => {
  await modalCancel(actor.page).click();
};

export const openProjectSettings: Task = async (actor) => {
  await projectSettings(actor.page).click();
  await projectSettingsHeading(actor.page).waitFor({ state: 'visible' });
};

export const openFindInProject: Task = async (actor) => {
  await findInProject(actor.page).click();
  await findInProjectHeading(actor.page).waitFor({ state: 'visible' });
};

export const searchInProject =
  (query: string): Task =>
  async (actor) => {
    await projectSearchFind(actor.page).fill(query);
  };

export const clickFixWithAi: Task = async (actor) => {
  const button = fixWithAi(actor.page);
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
};

export const tryOpenAiReplace: Task = async (actor) => {
  const button = fixWithAi(actor.page);
  await button.waitFor({ state: 'visible' });
  if (await button.isEnabled()) {
    await button.click();
  }
};

export const createNamedProject =
  (name: string): Task =>
  async (actor) => {
    await actor.page.goto('/projects');
    await newProjectButton(actor.page).click();
    await newProjectHeading(actor.page).waitFor({ state: 'visible' });
    await projectNameField(actor.page).fill(name);
    await createProjectButton(actor.page).click();
    await actor.page.waitForURL(/\/projects\/[0-9a-f-]+/i, { timeout: 20_000 });
  };
