import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./redisCache.js', () => ({
  redisDelMany: vi.fn().mockResolvedValue(undefined),
  redisDelByPattern: vi.fn().mockResolvedValue(undefined),
  buildRedisKey: (...parts: string[]) => parts.join(':'),
}));

vi.mock('./supabaseDatabase.js', () => ({
  getPublicationByProjectId: vi.fn().mockResolvedValue({ id: 'pub-1' }),
}));

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { logger } from '../logger.js';
import { redisDelByPattern, redisDelMany } from './redisCache.js';
import { getPublicationByProjectId } from './supabaseDatabase.js';
import { invalidateProjectAndRelatedCaches } from './cacheInvalidation.js';

describe('cacheInvalidation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invalidateProjectAndRelatedCaches deletes user project keys', async () => {
    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token');
    expect(redisDelMany).toHaveBeenCalled();
    const keys = vi.mocked(redisDelMany).mock.calls[0]?.[0] ?? [];
    expect(keys.some((k) => String(k).includes('user-1'))).toBe(true);
    expect(keys.some((k) => String(k).includes('proj-1'))).toBe(true);
  });

  it('returns early when project has no linked publication', async () => {
    vi.mocked(getPublicationByProjectId).mockResolvedValueOnce(null);

    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token');

    expect(redisDelMany).toHaveBeenCalledTimes(1);
    expect(redisDelByPattern).not.toHaveBeenCalled();
  });

  it('invalidates publication caches by id and slug', async () => {
    vi.mocked(getPublicationByProjectId).mockResolvedValueOnce({
      id: 'pub-99',
      slug: 'my-novel',
    } as Awaited<ReturnType<typeof getPublicationByProjectId>>);

    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token');

    expect(redisDelMany).toHaveBeenCalledTimes(3);
    expect(redisDelByPattern).toHaveBeenCalled();
  });

  it('invalidates publication list when invalidatePublicationList is true', async () => {
    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token', {
      invalidatePublicationList: true,
    });

    const listPatternCall = vi
      .mocked(redisDelByPattern)
      .mock.calls.find(([pattern]) => String(pattern).includes('pub:list'));
    expect(listPatternCall).toBeDefined();
  });

  it('passes useServiceRole to getPublicationByProjectId', async () => {
    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token', {
      useServiceRole: true,
    });

    expect(getPublicationByProjectId).toHaveBeenCalledWith('proj-1', 'user-1', 'token', {
      useServiceRole: true,
    });
  });

  it('logs warning and still clears user caches when publication lookup fails', async () => {
    vi.mocked(getPublicationByProjectId).mockRejectedValueOnce(new Error('db down'));

    await invalidateProjectAndRelatedCaches('user-1', 'proj-1', 'token');

    expect(redisDelMany).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', projectId: 'proj-1' }),
      'Failed to invalidate publication-related cache'
    );
  });
});
