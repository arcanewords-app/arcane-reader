import { describe, expect, it } from 'vitest';
import { paragraphUpdateBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('paragraphUpdateBodySchema contract', () => {
  it('accepts a valid update fixture', () => {
    const parsed = paragraphUpdateBodySchema.safeParse(
      loadFixture('paragraph-update.valid.json')
    );
    expect(parsed.success).toBe(true);
  });
});
