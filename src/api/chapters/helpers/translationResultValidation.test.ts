import { describe, expect, it } from 'vitest';
import {
  isValidPhase2TranslationText,
  validateTranslationPipelineResult,
} from './translationResultValidation.js';

describe('translationResultValidation', () => {
  it('validateTranslationPipelineResult rejects empty text', () => {
    const result = validateTranslationPipelineResult({
      translatedText: '',
      tokensUsed: 10,
      duration: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe('Translation empty or contains error');
  });

  it('validateTranslationPipelineResult rejects chunk error text', () => {
    const result = validateTranslationPipelineResult({
      translatedText: '[ERROR] chunk failed',
      tokensUsed: 10,
      duration: 100,
    });
    expect(result.valid).toBe(false);
  });

  it('validateTranslationPipelineResult rejects zero tokens and duration', () => {
    const result = validateTranslationPipelineResult({
      translatedText: 'Valid translation',
      tokensUsed: 0,
      duration: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('no tokens used');
  });

  it('validateTranslationPipelineResult accepts valid result', () => {
    const result = validateTranslationPipelineResult({
      translatedText: 'Valid translation',
      tokensUsed: 42,
      duration: 500,
    });
    expect(result.valid).toBe(true);
  });

  it('isValidPhase2TranslationText mirrors phase-2 check', () => {
    expect(isValidPhase2TranslationText('Edited text')).toBe(true);
    expect(isValidPhase2TranslationText('[ERROR] chunk failed')).toBe(false);
    expect(isValidPhase2TranslationText('')).toBe(false);
  });
});
