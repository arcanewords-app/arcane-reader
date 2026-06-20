/**
 * Circuit breaker route policy and Supabase status resolution (no Supabase client import).
 */

import type { HealthCheckResult, ServiceStatus } from './serviceHealth.js';
import { readSharedHealth } from './healthSnapshotStore.js';

/** Paths excluded from circuit breaker (mounted under /api). */
export function isHealthExemptPath(path: string): boolean {
  return path === '/status' || path === '/health';
}

/**
 * Public read-only GET routes that must stay available when a stale instance
 * thinks Supabase is down (handler + handleServiceError still apply).
 */
export function isPublicReadRoute(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  if (path === '/news' || path.startsWith('/news/')) return true;
  if (path === '/announcements/active') return true;
  if (path === '/publications' || path.startsWith('/publications/')) return true;
  if (path === '/public/entities' || path.startsWith('/public/entities/')) return true;
  return false;
}

/** Redis shared snapshot first, then in-memory Supabase probe state. */
export async function resolveSupabaseStatusForBreaker(
  getLocalSupabaseStatus: () => ServiceStatus,
  readShared: () => Promise<HealthCheckResult | null> = readSharedHealth
): Promise<ServiceStatus> {
  const shared = await readShared();
  const sharedStatus = shared?.services?.supabase?.status;
  if (sharedStatus) return sharedStatus;
  return getLocalSupabaseStatus();
}
