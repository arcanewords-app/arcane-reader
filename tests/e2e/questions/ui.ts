import { expect } from '@playwright/test';
import type { Question } from '../actors/types.js';

export const catalogHasPublications: Question = async (actor) => {
  await expect(actor.page.getByRole('button', { name: /Open publication:/ }).first()).toBeVisible({
    timeout: 20_000,
  });
};

export const publicationPageLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/p\//);
  await expect(actor.page.locator('h1').first()).toBeVisible();
};

export const newsPageLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/news/);
  await expect(actor.page.getByRole('heading', { name: 'News' })).toBeVisible();
};

export const accountTiersLoaded: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/account-tiers/);
  await expect(actor.page.getByRole('heading', { name: 'Account levels' })).toBeVisible();
};

export const seesLoginRequired: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\?login=required/);
  await expect(actor.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
};

export const seesUpgradeScreen: Question = async (actor) => {
  await expect(
    actor.page.getByRole('heading', { name: 'Author subscription required' })
  ).toBeVisible({ timeout: 15_000 });
};

export const seesAdminDenied: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Admin access required' })).toBeVisible({
    timeout: 15_000,
  });
};

export const seesProjectsGrid: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'My projects' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(actor.page.locator('.project-card').first()).toBeVisible({ timeout: 20_000 });
};

export const seesEmptyAuthorWorkspace: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'My projects' })).toBeVisible();
  await expect(actor.page.getByRole('button', { name: 'New project' })).toBeVisible();
};

export const seesProfile: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Reading history' })).toBeVisible({
    timeout: 15_000,
  });
};

export const seesLoggedInHeader: Question = async (actor) => {
  await expect(actor.page.getByRole('button', { name: 'Log out' })).toBeVisible();
};

export const seesGuestHeader: Question = async (actor) => {
  await expect(actor.page.getByRole('button', { name: 'Log in' })).toBeVisible();
};

export const seesAdminUsers: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Users' }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(actor.page.getByText('user@local.test')).toBeVisible();
  await expect(actor.page.getByText('author@local.test')).toBeVisible();
};

export const seesAdminPublications: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: /Publications/i }).first()).toBeVisible({
    timeout: 15_000,
  });
};

export const seesGlossary: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
};

export const seesReadingMode: Question = async (actor) => {
  await expect(actor.page).toHaveURL(/\/reading/);
};

export const seesTokenCredits: Question = async (actor) => {
  await expect(actor.page.locator('.token-usage-indicator')).toBeVisible({ timeout: 15_000 });
};

export const seesBasicModelLock: Question = async (actor) => {
  await expect(actor.page.locator('option[disabled]', { hasText: '(Author+)' }).first()).toBeAttached();
};

export const seesUnlockedPremiumModels: Question = async (actor) => {
  await expect(actor.page.locator('option[disabled]', { hasText: '(Author+)' })).toHaveCount(0);
};

export const seesCriticUpgrade: Question = async (actor) => {
  await expect(
    actor.page.getByRole('heading', { name: 'Translation review — Author+' })
  ).toBeVisible();
};

export const seesCriticConfirm: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Start review?' })).toBeVisible();
};

export const seesAiReplaceUpgrade: Question = async (actor) => {
  await expect(
    actor.page.getByRole('heading', { name: 'Smart AI replace — Author+' })
  ).toBeVisible();
};

export const seesAiReplaceSetup: Question = async (actor) => {
  await expect(actor.page.getByRole('heading', { name: 'Smart replace' })).toBeVisible();
};

export const readingHistoryHasItem: Question = async (actor) => {
  await actor.page.goto('/profile');
  await expect(actor.page.getByRole('heading', { name: 'Reading history' })).toBeVisible();
  await expect(actor.page.getByText('No reading history yet')).toHaveCount(0);
};
