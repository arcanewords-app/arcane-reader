import { describe, expect, it } from 'vitest';
import { parseTranslationStages, isTranslationStageKind } from './translationStages.js';

describe('translationStages', () => {
  it('isTranslationStageKind accepts valid stages', () => {
    expect(isTranslationStageKind('analysis')).toBe(true);
    expect(isTranslationStageKind('translation')).toBe(true);
    expect(isTranslationStageKind('editing')).toBe(true);
    expect(isTranslationStageKind('critic')).toBe(false);
  });

  it('parseTranslationStages returns deduped array from body', () => {
    expect(parseTranslationStages(['translation', 'analysis', 'translation', 'bogus'])).toEqual([
      'translation',
      'analysis',
    ]);
  });

  it('parseTranslationStages returns all for explicit all or empty/invalid', () => {
    expect(parseTranslationStages('all')).toBe('all');
    expect(parseTranslationStages(undefined)).toBe('all');
    expect(parseTranslationStages(['bogus'])).toBe('all');
  });
});
