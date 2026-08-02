import { describe, expect, it } from 'vitest';
import { chapterIdsBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterIdsBodySchema contract', () => {
  it('accepts a valid chapter ids fixture', () => {
    const parsed = chapterIdsBodySchema.safeParse(loadFixture('chapter-ids.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects empty chapterIds array', () => {
    const parsed = chapterIdsBodySchema.safeParse(
      loadFixture('chapter-ids.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
