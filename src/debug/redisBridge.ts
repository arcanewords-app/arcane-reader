/**
 * Publish worker debug logs to API process via Redis pub/sub (dev only).
 */

import { Redis } from 'ioredis';
import type { DebugLogEntry } from './buffer.js';

const CHANNEL = 'arcane:debug:logs';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let subscribed = false;

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  return url && (url.startsWith('redis://') || url.startsWith('rediss://')) ? url : null;
}

function createClient(): Redis {
  const url = getRedisUrl();
  if (!url) throw new Error('REDIS_URL required');
  return new Redis(url, { maxRetriesPerRequest: null });
}

function getPublisher(): Redis | null {
  if (!isDev() || !getRedisUrl()) return null;
  if (!publisher) publisher = createClient();
  return publisher;
}

export async function publishDebugLogEntry(entry: DebugLogEntry): Promise<void> {
  try {
    const redis = getPublisher();
    if (!redis) return;
    await redis.publish(CHANNEL, JSON.stringify({ ...entry, process: 'worker' as const }));
  } catch {
    // non-fatal
  }
}

export async function startDebugLogSubscriber(
  onEntry: (entry: DebugLogEntry) => void
): Promise<boolean> {
  if (!isDev() || process.env.RUN_AS_WORKER === '1') return false;
  const url = getRedisUrl();
  if (!url) return false;

  try {
    if (!subscriber) subscriber = createClient();
    if (!subscribed && subscriber) {
      subscribed = true;
      const sub = subscriber;
      sub.on('message', (_ch: string, message: string) => {
        try {
          const parsed = JSON.parse(message) as DebugLogEntry;
          onEntry({ ...parsed, process: 'worker' });
        } catch {
          // ignore
        }
      });
      await sub.subscribe(CHANNEL);
    }
    return true;
  } catch {
    return false;
  }
}

export async function closeDebugRedisBridge(): Promise<void> {
  if (publisher) {
    await publisher.quit().catch(() => undefined);
    publisher = null;
  }
  if (subscriber) {
    await subscriber.quit().catch(() => undefined);
    subscriber = null;
    subscribed = false;
  }
}

export function isDebugRedisBridgeAvailable(): boolean {
  return isDev() && getRedisUrl() !== null;
}
