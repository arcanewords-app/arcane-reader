/**
 * Shared service health snapshot in Redis (cross-instance on serverless).
 */

import { CACHE_PREFIX, CACHE_TTL } from '../shared/cacheContract.js';
import { buildRedisKey, redisGetJson, redisSetJson } from './redisCache.js';
import type { HealthCheckResult } from './serviceHealth.js';

const HEALTH_KEY = buildRedisKey(CACHE_PREFIX.serviceHealth);

export async function readSharedHealth(): Promise<HealthCheckResult | null> {
  return redisGetJson<HealthCheckResult>(HEALTH_KEY);
}

export async function writeSharedHealth(result: HealthCheckResult): Promise<void> {
  await redisSetJson(HEALTH_KEY, result, CACHE_TTL.redisServiceHealthSec);
}

/** When stale and Supabase is down, await a live probe instead of returning cached down. */
export function shouldAwaitRecoveryProbe(
  isStale: boolean,
  supabaseStatus: 'healthy' | 'degraded' | 'down'
): boolean {
  return isStale && supabaseStatus === 'down';
}
