import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getLanguageOverrideWarnings, toLanguagePairOverride } from './languagePairOverride.js';

const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}:${vars.targetLanguageLabel ?? ''}` : key;

describe('languagePairOverride', () => {
  it('returns no warnings when batch pair matches project default', () => {
    const warnings = getLanguageOverrideWarnings({
      batchLanguagePair: { sourceLanguage: 'en', targetLanguage: 'ru' },
      project: { sourceLanguage: 'en', targetLanguage: 'ru', glossary: [{ id: 'g1' } as never] },
      selectedStages: ['translation'],
      hasTranslatedContent: true,
      t,
    });
    assert.deepEqual(warnings, []);
  });

  it('warns about glossary when overriding target language', () => {
    const warnings = getLanguageOverrideWarnings({
      batchLanguagePair: { sourceLanguage: 'en', targetLanguage: 'be' },
      project: { sourceLanguage: 'en', targetLanguage: 'ru', glossary: [{ id: 'g1' } as never] },
      selectedStages: ['translation'],
      hasTranslatedContent: false,
      t,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /languageOverrideGlossaryWarning/);
  });

  it('toLanguagePairOverride returns undefined for default pair', () => {
    assert.equal(
      toLanguagePairOverride(
        { sourceLanguage: 'en', targetLanguage: 'ru' },
        { sourceLanguage: 'en', targetLanguage: 'ru' }
      ),
      undefined
    );
  });
});
