import { describe, expect, it } from 'vitest';
import { registerBodySchema } from '../../../src/api/schemas/auth.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('registerBodySchema contract', () => {
  it('accepts a valid register body fixture', () => {
    const parsed = registerBodySchema.safeParse(loadFixture('register.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects a password shorter than 6 characters', () => {
    const parsed = registerBodySchema.safeParse(loadFixture('register.invalid-password.json'));
    expect(parsed.success).toBe(false);
  });
});
