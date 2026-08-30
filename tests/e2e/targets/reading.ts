import type { Page } from '@playwright/test';

export const publicationHeading = (page: Page) => page.getByRole('heading', { level: 1 });

export const publicationReadChapter = (page: Page) => page.getByTestId('publication-read-chapter');
