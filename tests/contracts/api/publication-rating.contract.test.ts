import { describe, expect, it } from 'vitest';
import { publicationRatingBodySchema } from '../../../src/api/schemas/publications.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('publicationRatingBodySchema contract', () => {
  it('accepts a valid rating fixture', () => {
    const parsed = publicationRatingBodySchema.safeParse(
      loadFixture('publication-rating.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects score below minimum', () => {
    const parsed = publicationRatingBodySchema.safeParse(
      loadFixture('publication-rating.invalid.json')
    );
    expect(parsed.success).toBe(false);
  });
});
