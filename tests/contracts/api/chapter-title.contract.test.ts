import { describe, expect, it } from 'vitest';
import { chapterTitleBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chapterTitleBodySchema contract', () => {
  it('accepts a valid title fixture', () => {
    const parsed = chapterTitleBodySchema.safeParse(loadFixture('chapter-title.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects blank title', () => {
    const parsed = chapterTitleBodySchema.safeParse(
      loadFixture('chapter-title.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
