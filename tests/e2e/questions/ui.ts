import { expect } from '@playwright/test';
import type { Question } from '../actors/types.js';
import {
  publicationsHeading,
  seedAuthorEmail,
  seedReaderEmail,
  usersHeading,
} from '../targets/admin.js';
import {
  adminDeniedHeading,
  emptyReadingHistory,
  logIn,
  logOut,
  readingHistoryHeading,
  signInHeading,
  upgradeHeading,
} from '../targets/auth.js';
import { accountTiersHeading, newsHeading, publicationCard } from '../targets/catalog.js';
import { publicationHeading } from '../targets/reading.js';
import {
  aiReplaceSetupHeading,
  aiReplaceUpgradeHeading,
  criticConfirmHeading,
  criticUpgradeHeading,
  fixWithAi,
  glossaryHeading,
  lockedPremiumModel,
  newProjectButton,
  projectCard,
  projectsHeading,
  tokenUsage,
} from '../targets/workspace.js';

export const catalogHasPublications: Question = async (actor) => {
  await expect(publicationCard(actor.page).first()).toBeVisible({ timeout: 20_000 });
};

export const publicationPageLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/p\//);
  await expect(publicationHeading(actor.page).first()).toBeVisible();
};

export const newsPageLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/news/);
  await expect(newsHeading(actor.page)).toBeVisible();
};

export const accountTiersLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/account-tiers/);
  await expect(accountTiersHeading(actor.page)).toBeVisible();
};

export const seesLoginRequired: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\?login=required/);
  await expect(signInHeading(actor.page)).toBeVisible();
};

export const seesUpgradeScreen: Question = async (actor) => {
  await expect(upgradeHeading(actor.page)).toBeVisible({ timeout: 15_000 });
};

export const seesAdminDenied: Question = async (actor) => {
  await expect(adminDeniedHeading(actor.page)).toBeVisible({ timeout: 15_000 });
};

export const seesProjectsGrid: Question = async (actor) => {
  await expect(projectsHeading(actor.page)).toBeVisible({ timeout: 15_000 });
  await expect(projectCard(actor.page).first()).toBeVisible({ timeout: 20_000 });
};

export const seesEmptyAuthorWorkspace: Question = async (actor) => {
  await expect(projectsHeading(actor.page)).toBeVisible();
  await expect(newProjectButton(actor.page)).toBeVisible();
};

export const seesProfile: Question = async (actor) => {
  await expect(readingHistoryHeading(actor.page)).toBeVisible({ timeout: 15_000 });
};

export const seesLoggedInHeader: Question = async (actor) => {
  await expect(logOut(actor.page)).toBeVisible();
};

export const seesGuestHeader: Question = async (actor) => {
  await expect(logIn(actor.page)).toBeVisible();
};

export const seesAdminUsers: Question = async (actor) => {
  await expect(usersHeading(actor.page).first()).toBeVisible({ timeout: 15_000 });
  await expect(seedReaderEmail(actor.page)).toBeVisible();
  await expect(seedAuthorEmail(actor.page)).toBeVisible();
};

export const seesAdminPublications: Question = async (actor) => {
  await expect(publicationsHeading(actor.page).first()).toBeVisible({ timeout: 15_000 });
};

export const seesGlossary: Question = async (actor) => {
  await expect(glossaryHeading(actor.page)).toBeVisible();
};

export const seesReadingMode: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/reading/);
};

export const seesTokenCredits: Question = async (actor) => {
  await expect(tokenUsage(actor.page)).toBeVisible({ timeout: 15_000 });
};

export const seesBasicModelLock: Question = async (actor) => {
  await expect(lockedPremiumModel(actor.page).first()).toBeAttached();
};

export const seesUnlockedPremiumModels: Question = async (actor) => {
  await expect(lockedPremiumModel(actor.page)).toHaveCount(0);
};

export const seesCriticUpgrade: Question = async (actor) => {
  await expect(criticUpgradeHeading(actor.page)).toBeVisible();
};

export const seesCriticConfirm: Question = async (actor) => {
  await expect(criticConfirmHeading(actor.page)).toBeVisible();
};

export const seesAiReplaceSetup: Question = async (actor) => {
  await expect(aiReplaceSetupHeading(actor.page)).toBeVisible();
};

export const seesFixWithAiEnabled: Question = async (actor) => {
  await expect(fixWithAi(actor.page)).toBeEnabled({ timeout: 20_000 });
};

export const seesAiReplaceUpgradeOrHint: Question = async (actor) => {
  const heading = aiReplaceUpgradeHeading(actor.page);
  if (await heading.isVisible()) {
    await expect(heading).toBeVisible();
    return;
  }
  await expect(fixWithAi(actor.page)).toBeDisabled();
};

export const readingHistoryHasItem: Question = async (actor) => {
  await actor.page.goto('/profile');
  await expect(readingHistoryHeading(actor.page)).toBeVisible();
  await expect(emptyReadingHistory(actor.page)).toHaveCount(0);
};
