import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFetchJson, mockFetchJsonDeduped } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
  mockFetchJsonDeduped: vi.fn(),
}));

vi.mock('../transport/fetchJson.js', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

vi.mock('../transport/fetchDeduped.js', () => ({
  fetchJsonDeduped: (...args: unknown[]) => mockFetchJsonDeduped(...args),
}));

import { userApi } from './user.js';

describe('userApi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getProfile calls fetchJson with profile endpoint', async () => {
    const profile = { id: 'u1', email: 'a@b.com', role: 'author', avatarUrl: null };
    mockFetchJson.mockResolvedValue(profile);

    const result = await userApi.getProfile();
    assert.deepEqual(result, profile);
    assert.equal(mockFetchJson.mock.calls[0]?.[0], '/api/user/profile');
  });

  it('getTokenUsage calls fetchJsonDeduped with default endpoint', async () => {
    const usage = { tokensUsed: 100, tokensLimit: 50000, tokensRemaining: 49900 };
    mockFetchJsonDeduped.mockResolvedValue(usage);

    const result = await userApi.getTokenUsage();
    assert.deepEqual(result, usage);
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/user/token-usage');
  });

  it('getTokenUsage passes date query when provided', async () => {
    mockFetchJsonDeduped.mockResolvedValue({});

    await userApi.getTokenUsage('2026-07-12');
    assert.equal(mockFetchJsonDeduped.mock.calls[0]?.[0], '/api/user/token-usage?date=2026-07-12');
  });
});
