import { describe, expect, it } from 'vitest';
import {
  coerceSourceForTargetChange,
  formatLanguagePairLabel,
  isValidLanguagePair,
  languagePairsEqual,
  normalizeProjectSourceLanguage,
  normalizeProjectTargetLanguage,
  projectDefaultLanguagePair,
  sourceLanguageOptions,
  sourcesForTarget,
  targetLanguageOptions,
} from './translationLanguages.js';

const t = (key: string) => (key === 'language.en' ? 'English' : '');

describe('translationLanguages', () => {
  it('allows Russian as a source only when the target is Belarusian', () => {
    expect(sourcesForTarget('be')).toEqual(['en', 'ko', 'zh', 'ru']);
    expect(sourcesForTarget('ru')).toEqual(['en', 'ko', 'zh']);
    expect(isValidLanguagePair('ru', 'be')).toBe(true);
    expect(isValidLanguagePair('ru', 'ru')).toBe(false);
  });

  it('labels a pair and falls back to the language code', () => {
    expect(formatLanguagePairLabel(t, 'en', 'ru')).toBe('English → RU');
    expect(sourceLanguageOptions(t, 'be').map((option) => option.value)).toContain('ru');
    expect(targetLanguageOptions(t).map((option) => option.value)).toEqual(['ru', 'be']);
  });

  it('normalizes an unknown source or target back to the project default', () => {
    expect(normalizeProjectSourceLanguage('ko', 'ru')).toBe('ko');
    expect(normalizeProjectSourceLanguage('ru', 'ru')).toBe('en');
    expect(normalizeProjectSourceLanguage(undefined, 'be')).toBe('en');
    expect(normalizeProjectTargetLanguage('be')).toBe('be');
    expect(normalizeProjectTargetLanguage('ja')).toBe('ru');
    expect(normalizeProjectTargetLanguage(undefined)).toBe('ru');
    expect(coerceSourceForTargetChange('ru', 'ru')).toBe('en');
  });

  it('builds and compares the default pair stored on a project', () => {
    expect(projectDefaultLanguagePair({})).toEqual({
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    expect(projectDefaultLanguagePair({ sourceLanguage: 'ru', targetLanguage: 'be' })).toEqual({
      sourceLanguage: 'ru',
      targetLanguage: 'be',
    });
    expect(
      languagePairsEqual(
        { sourceLanguage: 'en', targetLanguage: 'ru' },
        { sourceLanguage: 'en', targetLanguage: 'ru' }
      )
    ).toBe(true);
    expect(
      languagePairsEqual(
        { sourceLanguage: 'en', targetLanguage: 'ru' },
        { sourceLanguage: 'ko', targetLanguage: 'ru' }
      )
    ).toBe(false);
  });
});
