import type { Page } from '@playwright/test';

export const usersHeading = (page: Page) => page.getByRole('heading', { name: 'Users' });

export const publicationsHeading = (page: Page) =>
  page.getByRole('heading', { name: /Publications/i });

export const seedReaderEmail = (page: Page) => page.getByText('user@local.test');

export const seedAuthorEmail = (page: Page) => page.getByText('author@local.test');
