/**
 * In-memory ring buffer of recent log entries for the /debug viewer.
 * Dev only. Includes trace index for waterfall views.
 */

import { mergeDebugContext } from './context.js';

const DEFAULT_MAX = 2000;

function maxEntries(): number {
  const n = parseInt(process.env.DEBUG_LOG_MAX_ENTRIES ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX;
}

export interface DebugLogEntry {
  time: string;
  level: string;
  msg?: string;
  process?: 'api' | 'worker';
  [key: string]: unknown;
}

export interface DebugTraceSummary {
  traceId: string;
  firstTime: string;
  lastTime: string;
  entryCount: number;
  errorCount: number;
  warnCount: number;
  projectId?: string;
  chapterId?: string;
  jobId?: string;
  requestId?: string;
  lastMsg?: string;
}

const buffer: DebugLogEntry[] = [];
let index = 0;
const traceIndex = new Map<string, DebugTraceSummary>();

function updateTraceIndex(entry: DebugLogEntry): void {
  const id =
    (typeof entry.traceId === 'string' && entry.traceId) ||
    (typeof entry.jobId === 'string' && entry.jobId) ||
    (typeof entry.requestId === 'string' && entry.requestId);
  if (!id) return;

  const time = String(entry.time ?? '');
  const existing = traceIndex.get(id);
  const level = String(entry.level ?? '');
  const isError = level === 'error' || level === 'fatal';
  const isWarn = level === 'warn';

  if (!existing) {
    traceIndex.set(id, {
      traceId: id,
      firstTime: time,
      lastTime: time,
      entryCount: 1,
      errorCount: isError ? 1 : 0,
      warnCount: isWarn ? 1 : 0,
      projectId: typeof entry.projectId === 'string' ? entry.projectId : undefined,
      chapterId: typeof entry.chapterId === 'string' ? entry.chapterId : undefined,
      jobId: typeof entry.jobId === 'string' ? entry.jobId : undefined,
      requestId: typeof entry.requestId === 'string' ? entry.requestId : undefined,
      lastMsg: typeof entry.msg === 'string' ? entry.msg : undefined,
    });
    return;
  }

  existing.entryCount += 1;
  if (time && (!existing.lastTime || time > existing.lastTime)) {
    existing.lastTime = time;
    if (typeof entry.msg === 'string') existing.lastMsg = entry.msg;
  }
  if (time && (!existing.firstTime || time < existing.firstTime)) existing.firstTime = time;
  if (isError) existing.errorCount += 1;
  if (isWarn) existing.warnCount += 1;
  if (typeof entry.projectId === 'string') existing.projectId = entry.projectId;
  if (typeof entry.chapterId === 'string') existing.chapterId = entry.chapterId;
  if (typeof entry.jobId === 'string') existing.jobId = entry.jobId;
  if (typeof entry.requestId === 'string') existing.requestId = entry.requestId;
}

function defaultProcess(): 'api' | 'worker' {
  return process.env.RUN_AS_WORKER === '1' ? 'worker' : 'api';
}

export function addDebugLogEntry(entry: DebugLogEntry): void {
  const max = maxEntries();
  const enriched = mergeDebugContext({
    ...entry,
    process: entry.process ?? defaultProcess(),
  }) as DebugLogEntry;

  const next = index % max;
  buffer[next] = enriched;
  index += 1;
  updateTraceIndex(enriched);

  if (process.env.NODE_ENV !== 'production' && process.env.RUN_AS_WORKER === '1') {
    void import('./redisBridge.js').then(({ publishDebugLogEntry }) => {
      publishDebugLogEntry(enriched);
    });
  }
}

export function getDebugLogEntries(): DebugLogEntry[] {
  const max = maxEntries();
  if (index <= max) {
    return [...buffer.slice(0, index)];
  }
  const start = index % max;
  return [...buffer.slice(start), ...buffer.slice(0, start)];
}

export function getDebugLogEntriesNewestFirst(): DebugLogEntry[] {
  return [...getDebugLogEntries()].reverse();
}

export function clearDebugLogEntries(): void {
  buffer.length = 0;
  index = 0;
  traceIndex.clear();
}

export function getDebugTraces(): DebugTraceSummary[] {
  return [...traceIndex.values()].sort((a, b) => b.lastTime.localeCompare(a.lastTime));
}

export function getEntriesForCorrelation(id: string): DebugLogEntry[] {
  return getDebugLogEntries().filter(
    (e) => e.traceId === id || e.jobId === id || e.requestId === id
  );
}

export function getDistinctEvents(): string[] {
  const events = new Set<string>();
  for (const e of getDebugLogEntries()) {
    if (typeof e.event === 'string' && e.event) events.add(e.event);
  }
  return [...events].sort();
}
