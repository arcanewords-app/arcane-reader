import type { Page } from '@playwright/test';

export const newsHeadingNamed = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true });

export const localeButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

export const localeMenuItem = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true });

export const fallbackNote = (page: Page, label: string) => page.getByText(label, { exact: true });

export const newsBanner = (page: Page) => page.getByRole('region');
