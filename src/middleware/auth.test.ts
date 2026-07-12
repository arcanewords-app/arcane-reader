import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { invalidateProfileCache } from './auth.js';

describe('auth profile cache', () => {
  it('invalidateProfileCache is callable without throwing', () => {
    assert.doesNotThrow(() => invalidateProfileCache('user-1'));
  });
});
