import type { Page } from '@playwright/test';

export const logIn = (page: Page) => page.getByRole('button', { name: 'Log in' });

export const logOut = (page: Page) => page.getByRole('button', { name: 'Log out' });

export const signInHeading = (page: Page) => page.getByRole('heading', { name: 'Sign in' });

export const emailField = (page: Page) => page.getByLabel('Email');

export const passwordField = (page: Page) => page.getByLabel('Password');

export const signInSubmit = (page: Page) => page.getByRole('button', { name: 'Sign in' });

export const modalCancel = (page: Page) => page.getByRole('button', { name: 'Cancel' });

export const upgradeHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Author subscription required' });

export const adminDeniedHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Admin access required' });

export const readingHistoryHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Reading history' });

export const emptyReadingHistory = (page: Page) => page.getByText('No reading history yet');
