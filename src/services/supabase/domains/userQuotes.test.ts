/** @vitest-environment node */
import assert from 'node:assert/strict';
import { describe, it, vi, beforeEach } from 'vitest';
import { UserQuoteError, USER_QUOTES_MAX_COUNT } from './userQuotes.js';

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('./publications.js', () => ({
  getPublicationById: vi.fn(),
}));

describe('userQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UserQuoteError exposes code', () => {
    const error = new UserQuoteError('Quote limit reached', 'LIMIT_REACHED');
    assert.equal(error.code, 'LIMIT_REACHED');
    assert.equal(error.name, 'UserQuoteError');
  });

  it('USER_QUOTES_MAX_COUNT is 500', () => {
    assert.equal(USER_QUOTES_MAX_COUNT, 500);
  });
});
