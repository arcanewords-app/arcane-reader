import { describe, expect, it } from 'vitest';
import { publishBodySchema } from '../../../src/api/schemas/publications.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('publishBodySchema contract', () => {
  it('accepts a valid publish body fixture', () => {
    const parsed = publishBodySchema.safeParse(loadFixture('publish-body.valid.json'));
    expect(parsed.success).toBe(true);
  });
});
