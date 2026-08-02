import { describe, expect, it } from 'vitest';
import { chapterTranslateBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterTranslateBodySchema contract', () => {
  it('accepts stages: all fixture', () => {
    const parsed = chapterTranslateBodySchema.safeParse(loadFixture('chapter-translate-all.json'));
    expect(parsed.success).toBe(true);
  });

  it('accepts explicit stages array + languagePair fixture', () => {
    const parsed = chapterTranslateBodySchema.safeParse(
      loadFixture('chapter-translate-stages.json')
    );
    expect(parsed.success).toBe(true);
  });
});
