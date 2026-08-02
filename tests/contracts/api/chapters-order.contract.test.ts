import { describe, expect, it } from 'vitest';
import { chaptersOrderBodySchema } from '../../../src/api/schemas/chapters.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('chaptersOrderBodySchema contract', () => {
  it('accepts a valid order fixture', () => {
    const parsed = chaptersOrderBodySchema.safeParse(loadFixture('chapters-order.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects empty ids array', () => {
    const parsed = chaptersOrderBodySchema.safeParse(
      loadFixture('chapters-order.invalid-empty.json')
    );
    expect(parsed.success).toBe(false);
  });
});
