import { Redis } from '@upstash/redis';
import { cacheVersionedKey } from '../shared/cacheContract.js';

type CachePrimitive = string | number | boolean;

let redisSingleton: Redis | null = null;

function getRedisEnv(): {
  url: string;
  token: string;
} | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function getRedis(): Redis | null {
  if (redisSingleton) return redisSingleton;
  const env = getRedisEnv();
  if (!env) return null;
  redisSingleton = new Redis({
    url: env.url,
    token: env.token,
  });
  return redisSingleton;
}

export function hasRedisCache(): boolean {
  return getRedis() !== null;
}

/**
 * Ping Redis to verify connectivity. Used by health check.
 * Throws if Redis is not configured or unreachable.
 */
export async function redisPing(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    throw new Error('Redis not configured');
  }
  const result = await redis.ping();
  if (result !== 'PONG') {
    throw new Error(`Redis ping unexpected response: ${result}`);
  }
}

export function buildRedisKey(prefix: string, ...parts: CachePrimitive[]): string {
  return cacheVersionedKey([prefix, ...parts]);
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<T>(key);
  return value ?? null;
}

export async function redisSetJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, value, { ex: ttlSeconds });
}

export async function redisDelMany(keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  await redis.del(...keys);
}

/**
 * Delete all keys matching a glob pattern (e.g. "v1:pub:chapter:pubId:*").
 * Uses SCAN to avoid blocking. Safe for production.
 */
export async function redisDelByPattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  let cursor = 0;
  let deleted = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = typeof nextCursor === 'string' ? parseInt(nextCursor, 10) : (nextCursor as number);
    if (keys.length > 0) {
      await redis.del(...(keys as string[]));
      deleted += keys.length;
    }
  } while (cursor !== 0);
  return deleted;
}
