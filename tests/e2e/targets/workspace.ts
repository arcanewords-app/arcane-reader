import type { Page } from '@playwright/test';

export const projectsHeading = (page: Page) => page.getByRole('heading', { name: 'My projects' });

export const projectCard = (page: Page) => page.getByTestId('project-card');

export const newProjectButton = (page: Page) => page.getByRole('button', { name: 'New project' });

export const newProjectHeading = (page: Page) => page.getByRole('heading', { name: 'New project' });

export const projectNameField = (page: Page) => page.getByPlaceholder('e.g. Lord of the Rings');

export const createProjectButton = (page: Page) => page.getByRole('button', { name: 'Create' });

export const glossaryButton = (page: Page) => page.getByRole('button', { name: /Glossary/ });

export const glossaryHeading = (page: Page) => page.getByRole('heading', { name: 'Glossary' });

export const chapterItem = (page: Page) => page.getByTestId('chapter-item');

export const chapterReadingMode = (page: Page) => page.getByTestId('chapter-reading-mode');

export const chapterActions = (page: Page) => page.getByTestId('chapter-actions');

export const reviewTranslation = (page: Page) =>
  page.getByRole('menuitem', { name: 'Review translation' });

export const projectSettings = (page: Page) =>
  page.getByRole('button', { name: 'Project settings' });

export const projectSettingsHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Project settings' });

export const findInProject = (page: Page) => page.getByRole('button', { name: 'Find in project' });

export const findInProjectHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Find in project' });

export const projectSearchFind = (page: Page) => page.getByTestId('project-search-find');

export const fixWithAi = (page: Page) => page.getByRole('button', { name: 'Fix with AI' });

export const tokenUsage = (page: Page) => page.getByTestId('token-usage');

export const translationModel = (page: Page) => page.getByTestId('settings-model-translation');

export const lockedPremiumModel = (page: Page) =>
  translationModel(page).locator('option[disabled]', { hasText: '(Author+)' });

export const criticUpgradeHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Translation review — Author+' });

export const criticConfirmHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Start review?' });

export const aiReplaceSetupHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Smart replace' });

export const aiReplaceUpgradeHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Smart AI replace — Author+' });
