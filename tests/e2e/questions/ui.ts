import { expect, type Page } from '@playwright/test';
import type { Question } from '../actors/types.js';
import { LAYOUT_VIEWPORTS } from '../viewports.js';
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
import {
  accountTiersHeading,
  aboutHeading,
  newsHeading,
  publicationCard,
} from '../targets/catalog.js';
import { publicationHeading, readingModeParagraph } from '../targets/reading.js';
import {
  aiReplaceSetupHeading,
  aiReplaceUpgradeHeading,
  chapterReadingMode,
  criticConfirmHeading,
  criticUpgradeHeading,
  fixWithAi,
  glossaryButton,
  glossaryHeading,
  lockedPremiumModel,
  newProjectButton,
  projectCard,
  projectCardDate,
  projectsHeading,
  requestClosedButton,
  requestsHeading,
  tokenUsage,
  tokenUsageLoading,
} from '../targets/workspace.js';

async function waitForDocumentImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const img of document.images) {
      img.loading = 'eager';
    }
    await Promise.all(
      [...document.images].map(async (img) => {
        try {
          await img.decode();
        } catch {
          // Broken or empty src — placeholder is the stable paint.
        }
      })
    );
  });
}

async function settleTokenUsage(page: Page): Promise<void> {
  const indicator = tokenUsage(page);
  if ((await indicator.count()) === 0) return;
  if (!(await indicator.first().isVisible())) return;
  await expect(tokenUsageLoading(page)).toHaveCount(0);
}

export function layoutMatches(name: string): Question {
  return async (actor) => {
    const page = actor.page;
    const previous = page.viewportSize();
    try {
      for (const { id, width, height } of LAYOUT_VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await waitForDocumentImages(page);
        await waitForDocumentImages(page);
        await settleTokenUsage(page);
        await expect(page).toHaveScreenshot(`${name}-${id}.png`, {
          fullPage: true,
          mask: [tokenUsage(page), projectCardDate(page)],
        });
      }
    } finally {
      if (previous) {
        await page.setViewportSize(previous);
      }
    }
  };
}

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

export const aboutPageLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/about/);
  await expect(aboutHeading(actor.page)).toBeVisible();
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
  await expect(projectCard(actor.page)).toHaveCount(0);
};

export const seesProjectOverview: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/projects\/[0-9a-f-]+/i);
  await expect(glossaryButton(actor.page)).toBeVisible({ timeout: 20_000 });
};

export const seesChapterEditor: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/chapters\//);
  await expect(chapterReadingMode(actor.page)).toBeVisible({ timeout: 20_000 });
};

export const seesTranslationRequests: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/translation-requests/);
  await expect(requestsHeading(actor.page)).toBeVisible({ timeout: 15_000 });
};

export const seesRequestModeration: Question = async (actor) => {
  await expect(requestClosedButton(actor.page)).toBeVisible();
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
  await expect(readingModeParagraph(actor.page)).toBeVisible({ timeout: 20_000 });
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
