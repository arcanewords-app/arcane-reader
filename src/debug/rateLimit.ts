/**
 * In-memory rate limit for /api/debug/query (dev only, localhost).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const hits = new Map<string, number[]>();

function clientKey(ip: string | undefined): string {
  const raw = ip ?? 'local';
  if (raw === '::1' || raw === '127.0.0.1' || raw === '::ffff:127.0.0.1') return 'local';
  return raw;
}

function isLocalhost(ip: string | undefined): boolean {
  return clientKey(ip) === 'local';
}

export function checkDebugQueryRateLimit(ip: string | undefined): {
  allowed: boolean;
  retryAfterSec?: number;
} {
  if (isLocalhost(ip)) return { allowed: true };
  const key = clientKey(ip);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const prev = hits.get(key) ?? [];
  const recent = prev.filter((t) => t > windowStart);
  if (recent.length >= MAX_REQUESTS) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}
