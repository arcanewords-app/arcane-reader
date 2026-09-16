import type { Page } from '@playwright/test';

export const publicationHeading = (page: Page) => page.getByRole('heading', { level: 1 });

export const publicationReadChapter = (page: Page) => page.getByTestId('publication-read-chapter');

export const readingModeText = (page: Page) => page.getByTestId('reading-mode-text');

export const readingModeParagraph = (page: Page) =>
  readingModeText(page).locator('[data-paragraph-index="0"]');

export const readingModeSettings = (page: Page) => page.getByTestId('reading-mode-settings');

export const containerWidthSlider = (page: Page) => page.getByLabel('Container width');
