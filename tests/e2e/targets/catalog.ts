import type { Page } from '@playwright/test';

export const banner = (page: Page) => page.getByRole('banner');

export const publicationCard = (page: Page) => page.getByTestId('publication-card');

export const publicationDescription = (page: Page) => page.getByTestId('publication-description');

export const entityChip = (page: Page) => page.getByTestId('entity-chip');

const firstDescribedCard = (page: Page) =>
  publicationCard(page).filter({ has: publicationDescription(page) }).first();

export const firstCatalogDescription = (page: Page) =>
  firstDescribedCard(page).getByTestId('publication-description');

export const firstCatalogEntityChips = (page: Page) =>
  firstDescribedCard(page).getByTestId('entity-chip');

export const catalogTooltip = (page: Page) => page.getByRole('tooltip');

export const newsHeading = (page: Page) => page.getByRole('heading', { name: 'News' });

export const aboutHeading = (page: Page) => page.getByRole('heading', { name: 'About Arcane' });

export const accountTiersHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Account levels' });
