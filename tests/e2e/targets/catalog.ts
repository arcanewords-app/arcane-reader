import type { Page } from '@playwright/test';

export const banner = (page: Page) => page.getByRole('banner');

export const publicationCard = (page: Page) => page.getByTestId('publication-card');

export const newsHeading = (page: Page) => page.getByRole('heading', { name: 'News' });

export const accountTiersHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Account levels' });
