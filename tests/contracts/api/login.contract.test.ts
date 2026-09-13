import { describe, expect, it } from 'vitest';
import { loginBodySchema } from '../../../src/api/schemas/auth.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('loginBodySchema contract', () => {
  it('accepts a valid login body fixture', () => {
    const parsed = loginBodySchema.safeParse(loadFixture('login.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const parsed = loginBodySchema.safeParse(loadFixture('login.invalid-email.json'));
    expect(parsed.success).toBe(false);
  });
});
