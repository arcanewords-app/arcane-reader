import { describe, expect, it } from 'vitest';
import { readProgressBodySchema } from '../../../src/api/schemas/publications.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('readProgressBodySchema contract', () => {
  it('accepts complete mode fixture', () => {
    const parsed = readProgressBodySchema.safeParse(
      loadFixture('read-progress.complete.valid.json')
    );
    expect(parsed.success).toBe(true);
  });

  it('accepts set mode fixture', () => {
    const parsed = readProgressBodySchema.safeParse(loadFixture('read-progress.set.valid.json'));
    expect(parsed.success).toBe(true);
  });
});
