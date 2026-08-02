import { describe, expect, it } from 'vitest';
import { newsCreateSchema } from '../../../src/api/schemas/news.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('newsCreateSchema contract', () => {
  it('accepts a valid create body fixture', () => {
    const parsed = newsCreateSchema.safeParse(loadFixture('news-create.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown category', () => {
    const parsed = newsCreateSchema.safeParse(loadFixture('news-create.invalid-category.json'));
    expect(parsed.success).toBe(false);
  });
});
