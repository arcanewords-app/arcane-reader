import { expect } from '@playwright/test';
import { test } from '../fixtures/test.js';
import { openGlossary, openFirstProject } from '../tasks/workspace.js';
import { seesGlossary } from '../questions/ui.js';

test.describe('Author edition', () => {
  test('adds Belarusian and opens the shared glossary', async ({ author }) => {
    await author.attemptsTo(openFirstProject);

    const belarusian = author.page.getByRole('button', { name: 'Belarusian', exact: true });
    const addLanguage = author.page.getByRole('button', { name: 'Add a language' });
    await expect(belarusian.or(addLanguage)).toBeVisible();
    if ((await belarusian.count()) === 0) {
      await addLanguage.click();
      await author.page.getByRole('button', { name: 'Add Belarusian' }).click();
    }
    await expect(belarusian).toBeVisible();
    await belarusian.click();

    await author.attemptsTo(openGlossary);
    await author.see(seesGlossary);
    await expect(
      author.page.getByText(
        'The list of names is shared. Only the translation and case forms belong to this language.'
      )
    ).toBeVisible();
  });
});
