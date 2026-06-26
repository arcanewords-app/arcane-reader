/**
 * Optional JSONL persistence for dev debug buffers.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DebugLogEntry } from './buffer.js';
import type { CapturedLlmCall } from './promptCapture.js';
import type { CapturedHttpExchange } from './httpCapture.js';

export type PersistKind = 'log' | 'llm' | 'http';

export interface PersistRecord {
  kind: PersistKind;
  time: string;
  payload: DebugLogEntry | CapturedLlmCall | CapturedHttpExchange;
}

const DEFAULT_MAX_MB = 50;
const DEFAULT_HYDRATE_LINES = 2000;

function isPersistEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    (process.env.DEBUG_PERSIST === '1' || process.env.DEBUG_PERSIST === 'true')
  );
}

function isApiProcess(): boolean {
  return process.env.RUN_AS_WORKER !== '1';
}

function persistDir(): string {
  return path.resolve(process.cwd(), '.debug');
}

function sessionPath(): string {
  return path.join(persistDir(), 'session.jsonl');
}

function maxBytes(): number {
  const mb = parseInt(process.env.DEBUG_PERSIST_MAX_MB ?? '', 10);
  const n = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB;
  return n * 1024 * 1024;
}

function hydrateLineLimit(): number {
  const n = parseInt(process.env.DEBUG_PERSIST_HYDRATE_LINES ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HYDRATE_LINES;
}

function ensureDir(): void {
  if (!fs.existsSync(persistDir())) {
    fs.mkdirSync(persistDir(), { recursive: true });
  }
}

function rotateIfNeeded(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes()) return;
    const rotated = path.join(persistDir(), `session.${Date.now()}.jsonl`);
    fs.renameSync(filePath, rotated);
  } catch {
    // ignore
  }
}

export function appendPersistRecord(kind: PersistKind, payload: PersistRecord['payload']): void {
  if (!isPersistEnabled() || !isApiProcess()) return;
  try {
    ensureDir();
    const filePath = sessionPath();
    const time =
      typeof (payload as { time?: string }).time === 'string'
        ? (payload as { time: string }).time
        : new Date().toISOString();
    const line = JSON.stringify({ kind, time, payload } satisfies PersistRecord) + '\n';
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, line, 'utf8');
  } catch {
    // non-fatal
  }
}

export function readPersistRecords(limit = hydrateLineLimit()): PersistRecord[] {
  const filePath = sessionPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const slice = lines.length > limit ? lines.slice(-limit) : lines;
    const out: PersistRecord[] = [];
    for (const line of slice) {
      try {
        const parsed = JSON.parse(line) as PersistRecord;
        if (parsed.kind && parsed.payload) out.push(parsed);
      } catch {
        // skip bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function isDebugPersistEnabled(): boolean {
  return isPersistEnabled();
}

export function shouldHydrateOnStart(): boolean {
  return (
    isPersistEnabled() &&
    isApiProcess() &&
    (process.env.DEBUG_PERSIST_HYDRATE === '1' || process.env.DEBUG_PERSIST_HYDRATE === 'true')
  );
}
