import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./redisCache.js', () => ({
  redisDelMany: vi.fn().mockResolvedValue(undefined),
  redisDelByPattern: vi.fn().mockResolvedValue(undefined),
  buildRedisKey: (...parts: string[]) => parts.join(':'),
}));

vi.mock('./supabaseDatabase.js', () => ({
  getPublicationByProjectId: vi.fn().mockResolvedValue({ id: 'pub-1' }),
}));

import { redisDelMany } from './redisCache.js';
import { invalidateProjectAndRelatedCaches } from './cacheInvalidation.js';

describe('cacheInvalidation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invalidateProjectAndRelatedCaches deletes user project keys', async () => {
    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token');
    expect(redisDelMany).toHaveBeenCalled();
    const keys = vi.mocked(redisDelMany).mock.calls[0]?.[0] ?? [];
    assert.ok(keys.some((k) => String(k).includes('user-1')));
    assert.ok(keys.some((k) => String(k).includes('proj-1')));
  });
});
