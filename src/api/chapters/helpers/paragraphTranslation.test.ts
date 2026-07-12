import { describe, expect, it } from 'vitest';
import {
  computeTranslationTextLength,
  hasValidParagraphTranslation,
} from './paragraphTranslation.js';

describe('paragraphTranslation', () => {
  it('hasValidParagraphTranslation rejects empty and chunk errors', () => {
    expect(hasValidParagraphTranslation({ translatedText: 'ok' })).toBe(true);
    expect(hasValidParagraphTranslation({ translatedText: '' })).toBe(false);
    expect(hasValidParagraphTranslation({ translatedText: '❌ failed' })).toBe(false);
  });

  it('computeTranslationTextLength for selected paragraphs', () => {
    const paragraphs = [
      { id: 'a', originalText: 'hello', translatedText: '' },
      { id: 'b', originalText: 'world', translatedText: 'w' },
    ];
    expect(computeTranslationTextLength(100, paragraphs, { paragraphIds: ['a'] })).toBe(5);
  });

  it('computeTranslationTextLength for translateOnlyEmpty', () => {
    const paragraphs = [
      { id: 'a', originalText: 'hello', translatedText: '' },
      { id: 'b', originalText: 'world', translatedText: 'done' },
    ];
    expect(computeTranslationTextLength(100, paragraphs, { translateOnlyEmpty: true })).toBe(5);
  });
});
