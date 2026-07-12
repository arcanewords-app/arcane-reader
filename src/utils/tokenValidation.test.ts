import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { requireToken, validateToken } from './tokenValidation.js';

const VALID_TOKEN = 'header.payload.signature';

describe('validateToken', () => {
  it('accepts a well-formed JWT string', () => {
    assert.doesNotThrow(() => validateToken(VALID_TOKEN));
  });

  it('throws when token is missing', () => {
    assert.throws(() => validateToken(undefined), /Token is required/);
    assert.throws(() => validateToken(null), /Token is required/);
    assert.throws(() => validateToken(''), /Token is required/);
    assert.throws(() => validateToken('   '), /Token is required/);
  });

  it('throws when token is not a string', () => {
    assert.throws(() => validateToken(123 as unknown as string), /Token is required/);
  });

  it('throws when token does not have three JWT parts', () => {
    assert.throws(() => validateToken('only.two'), /Invalid token format/);
    assert.throws(() => validateToken('a.b.c.d'), /Invalid token format/);
  });

  it('throws when any JWT part is empty', () => {
    assert.throws(() => validateToken('a..c'), /JWT parts cannot be empty/);
    assert.throws(() => validateToken('.b.c'), /JWT parts cannot be empty/);
  });
});

describe('requireToken', () => {
  it('returns the token after validation', () => {
    assert.equal(requireToken(VALID_TOKEN), VALID_TOKEN);
  });

  it('throws for invalid token', () => {
    assert.throws(() => requireToken('bad'), /Invalid token format/);
  });
});
