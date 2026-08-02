import { describe, expect, it } from 'vitest';
import { chapterNumberBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterNumberBodySchema contract', () => {
  it('accepts a valid chapter number fixture', () => {
    const parsed = chapterNumberBodySchema.safeParse(loadFixture('chapter-number.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects non-positive number', () => {
    const parsed = chapterNumberBodySchema.safeParse(loadFixture('chapter-number.invalid.json'));
    expect(parsed.success).toBe(false);
  });
});
