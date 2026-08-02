/**
 * Redis cache stub — no network, hasRedisCache always false.
 */

import { vi } from 'vitest';

export function installRedisCacheMocks() {
  return {
    hasRedisCache: vi.fn(() => false),
    redisPing: vi.fn(async () => {
      throw new Error('Redis not configured');
    }),
    buildRedisKey: vi.fn((...parts: Array<string | number | boolean>) => parts.join(':')),
    redisGetJson: vi.fn(async () => null),
    redisSetJson: vi.fn(async () => undefined),
    redisDelMany: vi.fn(async () => undefined),
    redisDelByPattern: vi.fn(async () => 0),
  };
}
