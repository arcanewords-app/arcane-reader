import { describe, expect, it } from 'vitest';
import { refreshBodySchema } from '../../../src/api/schemas/auth.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('refreshBodySchema contract', () => {
  it('accepts a valid refresh body fixture', () => {
    const parsed = refreshBodySchema.safeParse(loadFixture('refresh.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty refresh token', () => {
    const parsed = refreshBodySchema.safeParse(loadFixture('refresh.invalid-empty.json'));
    expect(parsed.success).toBe(false);
  });
});
