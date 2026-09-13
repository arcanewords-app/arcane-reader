import { describe, expect, it } from 'vitest';
import { profileUpdateBodySchema } from '../../../src/api/schemas/user.js';
import { loadFixture } from '../helpers/loadFixture.js';

describe('profileUpdateBodySchema contract', () => {
  it('accepts a valid profile update fixture', () => {
    const parsed = profileUpdateBodySchema.safeParse(loadFixture('profile-update.valid.json'));
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-URL avatar', () => {
    const parsed = profileUpdateBodySchema.safeParse(
      loadFixture('profile-update.invalid-url.json')
    );
    expect(parsed.success).toBe(false);
  });
});
