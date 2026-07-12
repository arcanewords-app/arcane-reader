import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_AUTHENTICATED_ROLE, isAtLeastRole, parseRole, type UserRole } from './roles.js';

describe('isAtLeastRole', () => {
  it('returns true when current role meets required level', () => {
    assert.equal(isAtLeastRole('admin', 'author'), true);
    assert.equal(isAtLeastRole('author', 'author'), true);
  });

  it('returns false when current role is below required level', () => {
    assert.equal(isAtLeastRole('user', 'author'), false);
    assert.equal(isAtLeastRole('guest', 'user'), false);
  });
});

describe('parseRole', () => {
  it('returns known role strings unchanged', () => {
    const roles: UserRole[] = ['guest', 'user', 'author', 'author_plus', 'super_author', 'admin'];
    for (const role of roles) {
      assert.equal(parseRole(role), role);
    }
  });

  it('returns default for invalid values', () => {
    assert.equal(parseRole('superuser'), DEFAULT_AUTHENTICATED_ROLE);
    assert.equal(parseRole(null), DEFAULT_AUTHENTICATED_ROLE);
    assert.equal(parseRole(42), DEFAULT_AUTHENTICATED_ROLE);
  });
});
