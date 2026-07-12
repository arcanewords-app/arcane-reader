import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isNotFoundError, nullIfNotFound } from './postgrestErrors.js';

describe('postgrestErrors', () => {
  it('isNotFoundError detects PGRST116', () => {
    assert.equal(isNotFoundError({ code: 'PGRST116' }), true);
    assert.equal(isNotFoundError({ code: '23505' }), false);
  });

  it('nullIfNotFound returns null on not found', () => {
    assert.equal(nullIfNotFound(null, { code: 'PGRST116' }, 'get'), null);
  });

  it('nullIfNotFound throws on other errors', () => {
    assert.throws(
      () => nullIfNotFound(null, { code: 'XX', message: 'fail' }, 'get'),
      /Failed to get/
    );
  });
});
