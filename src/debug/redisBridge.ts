/**
 * Publish worker debug data to API process via Redis pub/sub (dev only).
 * Uses a Redis list backlog so messages survive API subscriber startup race.
 */

import type { Redis } from 'ioredis';
import type { DebugLogEntry } from './buffer.js';
import type { CapturedLlmCall } from './promptCapture.js';
import type { CapturedHttpExchange } from './httpCapture.js';

const CHANNEL = 'arcane:debug:logs';
const BACKLOG_KEY = 'arcane:debug:backlog';
const READY_KEY = 'arcane:debug:api-ready';

export type DebugBridgeMessage =
  | { kind: 'log'; entry: DebugLogEntry }
  | { kind: 'llm'; capture: CapturedLlmCall }
  | { kind: 'http'; exchange: CapturedHttpExchange };

export interface DebugBridgeHandlers {
  onLog: (entry: DebugLogEntry) => void;
  onLlm?: (capture: CapturedLlmCall) => void;
  onHttp?: (exchange: CapturedHttpExchange) => void;
}

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let subscribed = false;

const BRIDGE_SEEN_MAX = 2000;
const seenBridgePayloads = new Set<string>();

function isDuplicateBridgePayload(raw: string): boolean {
  if (seenBridgePayloads.has(raw)) return true;
  seenBridgePayloads.add(raw);
  if (seenBridgePayloads.size > BRIDGE_SEEN_MAX) {
    const keep = [...seenBridgePayloads].slice(-Math.floor(BRIDGE_SEEN_MAX / 2));
    seenBridgePayloads.clear();
    for (const item of keep) seenBridgePayloads.add(item);
  }
  return false;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  return url && (url.startsWith('redis://') || url.startsWith('rediss://')) ? url : null;
}

function backlogMax(): number {
  const n = parseInt(process.env.DEBUG_BRIDGE_BACKLOG ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

async function createClient(): Promise<Redis> {
  const url = getRedisUrl();
  if (!url) throw new Error('REDIS_URL required');
  const { Redis: RedisClient } = await import('ioredis');
  return new RedisClient(url, { maxRetriesPerRequest: null });
}

async function getPublisher(): Promise<Redis | null> {
  if (!isDev() || !getRedisUrl()) return null;
  if (!publisher) publisher = await createClient();
  return publisher;
}

function isWorkerProcess(): boolean {
  return process.env.RUN_AS_WORKER === '1';
}

function dispatchMessage(
  message: DebugBridgeMessage,
  handlers: DebugBridgeHandlers,
  raw?: string
): void {
  if (raw && isDuplicateBridgePayload(raw)) return;
  if (message.kind === 'log') handlers.onLog(message.entry);
  else if (message.kind === 'llm') handlers.onLlm?.(message.capture);
  else if (message.kind === 'http') handlers.onHttp?.(message.exchange);
}

export async function publishDebugBridgeMessage(message: DebugBridgeMessage): Promise<void> {
  if (!isWorkerProcess()) return;
  try {
    const redis = await getPublisher();
    if (!redis) return;
    const payload = JSON.stringify(message);
    const max = backlogMax();
    await redis.lpush(BACKLOG_KEY, payload);
    await redis.ltrim(BACKLOG_KEY, 0, max - 1);
    await redis.publish(CHANNEL, payload);
  } catch {
    // non-fatal
  }
}

/** @deprecated Use publishDebugBridgeMessage({ kind: 'log', entry }) */
export async function publishDebugLogEntry(entry: DebugLogEntry): Promise<void> {
  await publishDebugBridgeMessage({ kind: 'log', entry: { ...entry, process: 'worker' } });
}

export function parseBridgeMessage(message: string): DebugBridgeMessage | null {
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    if (parsed.kind === 'llm' && parsed.capture && typeof parsed.capture === 'object') {
      return { kind: 'llm', capture: parsed.capture as CapturedLlmCall };
    }
    if (parsed.kind === 'http' && parsed.exchange && typeof parsed.exchange === 'object') {
      return { kind: 'http', exchange: parsed.exchange as CapturedHttpExchange };
    }
    if (parsed.kind === 'log' && parsed.entry && typeof parsed.entry === 'object') {
      return {
        kind: 'log',
        entry: { ...(parsed.entry as DebugLogEntry), process: 'worker' },
      };
    }
    if (typeof parsed.time === 'string' && typeof parsed.level === 'string') {
      return { kind: 'log', entry: { ...(parsed as DebugLogEntry), process: 'worker' } };
    }
    return null;
  } catch {
    return null;
  }
}

async function drainBacklog(handlers: DebugBridgeHandlers): Promise<void> {
  const url = getRedisUrl();
  if (!url) return;
  const client = await createClient();
  try {
    const max = backlogMax();
    const items = await client.lrange(BACKLOG_KEY, 0, max - 1);
    for (const raw of [...items].reverse()) {
      const parsed = parseBridgeMessage(raw);
      if (parsed) dispatchMessage(parsed, handlers, raw);
    }
    await client.set(READY_KEY, '1', 'EX', 60);
  } catch {
    // non-fatal
  } finally {
    await client.quit().catch(() => undefined);
  }
}

export async function startDebugBridgeSubscriber(handlers: DebugBridgeHandlers): Promise<boolean> {
  if (!isDev() || isWorkerProcess()) return false;
  const url = getRedisUrl();
  if (!url) return false;

  try {
    await drainBacklog(handlers);
    if (!subscriber) subscriber = await createClient();
    if (!subscribed && subscriber) {
      subscribed = true;
      const sub = subscriber;
      sub.on('message', (_ch: string, message: string) => {
        const parsed = parseBridgeMessage(message);
        if (parsed) dispatchMessage(parsed, handlers, message);
      });
      await sub.subscribe(CHANNEL);
      await sub.set(READY_KEY, '1', 'EX', 60);
    }
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Use startDebugBridgeSubscriber */
export async function startDebugLogSubscriber(
  onEntry: (entry: DebugLogEntry) => void
): Promise<boolean> {
  return startDebugBridgeSubscriber({ onLog: onEntry });
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
