import { describe, expect, it } from 'vitest';
import { languagePairBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('languagePairBodySchema contract', () => {
  it('accepts a valid language pair fixture', () => {
    const parsed = languagePairBodySchema.safeParse(loadFixture('language-pair.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unsupported source language enum', () => {
    const parsed = languagePairBodySchema.safeParse(
      loadFixture('language-pair.invalid-source.json')
    );
    expect(parsed.success).toBe(false);
  });
});
