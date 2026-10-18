import { describe, expect, it } from 'vitest';
import {
  appendTranslationExamples,
  getTranslationExamplesFragment,
} from './translation-examples.js';

describe('translation examples', () => {
  it('returns the fragment for Russian and Belarusian targets only', () => {
    expect(getTranslationExamplesFragment('ru')).toContain('Элара');
    expect(getTranslationExamplesFragment('be')).toContain('назірала');
    expect(getTranslationExamplesFragment(undefined)).toBe('');
    expect(getTranslationExamplesFragment('en')).toBe('');
  });

  it('appends the fragment and leaves a prompt unchanged when there is none', () => {
    expect(appendTranslationExamples('System', 'en')).toBe('System');
    expect(appendTranslationExamples('System  ', 'ru').startsWith('System\n')).toBe(true);
  });
});
