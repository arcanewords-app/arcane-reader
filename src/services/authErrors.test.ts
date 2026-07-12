import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AuthServiceError, authErrorFromSupabase } from './authErrors.js';

describe('authErrors', () => {
  it('AuthServiceError prefixes message by operation', () => {
    const err = new AuthServiceError('login', 'Invalid credentials', { code: 'invalid' });
    assert.equal(err.name, 'AuthServiceError');
    assert.equal(err.operation, 'login');
    assert.match(err.message, /Login failed/);
    assert.equal(err.upstreamMessage, 'Invalid credentials');
    assert.equal(err.upstreamCode, 'invalid');
  });

  it('authErrorFromSupabase maps Supabase error shape', () => {
    const err = authErrorFromSupabase('register', {
      message: 'User exists',
      code: 'user_exists',
      status: 422,
    });
    assert.equal(err.operation, 'register');
    assert.match(err.message, /Registration failed/);
    assert.equal(err.upstreamCode, 'user_exists');
    assert.equal(err.upstreamStatus, 422);
  });
});
