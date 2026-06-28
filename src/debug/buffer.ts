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

const DEDUPE_MAX = 5000;
const recentFingerprints: string[] = [];
const fingerprintSet = new Set<string>();

export function logEntryFingerprint(entry: DebugLogEntry): string {
  return [
    entry.time,
    entry.traceId,
    entry.event,
    entry.msg,
    entry.chapterId,
    entry.jobId,
    entry.requestId,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join('|');
}

function isDuplicateLogEntry(entry: DebugLogEntry): boolean {
  const fp = logEntryFingerprint(entry);
  if (fingerprintSet.has(fp)) return true;
  fingerprintSet.add(fp);
  recentFingerprints.push(fp);
  if (recentFingerprints.length > DEDUPE_MAX) {
    const old = recentFingerprints.shift();
    if (old) fingerprintSet.delete(old);
  }
  return false;
}

export function dedupeLogEntries(entries: DebugLogEntry[]): DebugLogEntry[] {
  const seen = new Set<string>();
  const out: DebugLogEntry[] = [];
  for (const entry of entries) {
    const fp = logEntryFingerprint(entry);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(entry);
  }
  return out;
}

function resetDedupeState(): void {
  recentFingerprints.length = 0;
  fingerprintSet.clear();
}

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

function writeLogEntry(enriched: DebugLogEntry, options?: { skipBridge?: boolean }): void {
  if (isDuplicateLogEntry(enriched)) return;

  const max = maxEntries();
  const next = index % max;
  buffer[next] = enriched;
  index += 1;
  updateTraceIndex(enriched);

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.RUN_AS_WORKER === '1' &&
    !options?.skipBridge
  ) {
    void import('./redisBridge.js').then(({ publishDebugBridgeMessage }) => {
      publishDebugBridgeMessage({ kind: 'log', entry: enriched });
    });
  }

  if (process.env.NODE_ENV !== 'production' && process.env.RUN_AS_WORKER !== '1') {
    void import('./persist.js').then(({ appendPersistRecord }) => {
      appendPersistRecord('log', enriched);
    });
  }
}

export function addDebugLogEntry(entry: DebugLogEntry): void {
  const enriched = mergeDebugContext({
    ...entry,
    process: entry.process ?? defaultProcess(),
  }) as DebugLogEntry;
  writeLogEntry(enriched);
}

/** Ingest log from worker Redis bridge without re-publishing. */
export function importBridgedLogEntry(entry: DebugLogEntry): void {
  const enriched = mergeDebugContext({
    ...entry,
    process: 'worker' as const,
  }) as DebugLogEntry;
  writeLogEntry(enriched, { skipBridge: true });
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
  resetDedupeState();
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

export interface LogQueryFilters {
  traceId?: string;
  jobId?: string;
  requestId?: string;
  chapterId?: string;
  projectId?: string;
  event?: string;
  level?: string;
  process?: string;
  since?: string;
  until?: string;
  q?: string;
  errorsOnly?: boolean;
  excludeEvents?: string[];
}

function matchesCorrelation(
  entry: DebugLogEntry,
  filters: Pick<LogQueryFilters, 'traceId' | 'jobId' | 'requestId' | 'chapterId' | 'projectId'>
): boolean {
  if (filters.traceId && entry.traceId !== filters.traceId) return false;
  if (filters.jobId && entry.jobId !== filters.jobId) return false;
  if (filters.requestId && entry.requestId !== filters.requestId) return false;
  if (filters.chapterId && entry.chapterId !== filters.chapterId) return false;
  if (filters.projectId && entry.projectId !== filters.projectId) return false;
  return true;
}

export function queryLogEntries(filters: LogQueryFilters = {}): DebugLogEntry[] {
  const exclude = new Set(filters.excludeEvents ?? []);
  const qLower = filters.q?.toLowerCase();

  return getDebugLogEntriesNewestFirst().filter((entry) => {
    if (!matchesCorrelation(entry, filters)) return false;
    if (filters.event && entry.event !== filters.event) return false;
    if (filters.level && entry.level !== filters.level) return false;
    if (filters.process && entry.process !== filters.process) return false;
    if (filters.since && String(entry.time ?? '') < filters.since) return false;
    if (filters.until && String(entry.time ?? '') > filters.until) return false;
    if (filters.errorsOnly) {
      const level = String(entry.level ?? '');
      if (level !== 'error' && level !== 'fatal') return false;
    }
    if (exclude.size > 0 && typeof entry.event === 'string' && exclude.has(entry.event)) {
      return false;
    }
    if (qLower) {
      const hay = [entry.msg, entry.event, entry.traceId, entry.jobId, entry.requestId]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
}

export function getTracesForJob(jobId: string): DebugTraceSummary[] {
  const traceIds = new Set<string>();
  for (const e of getDebugLogEntries()) {
    if (e.jobId === jobId && typeof e.traceId === 'string' && e.traceId) {
      traceIds.add(e.traceId);
    }
  }
  const summaries: DebugTraceSummary[] = [];
  for (const traceId of traceIds) {
    const fromIndex = traceIndex.get(traceId);
    if (fromIndex) summaries.push(fromIndex);
    else {
      const entries = getEntriesForCorrelation(traceId).filter((e) => e.jobId === jobId);
      if (entries.length === 0) continue;
      const sorted = [...entries].sort((a, b) =>
        String(a.time ?? '').localeCompare(String(b.time ?? ''))
      );
      summaries.push({
        traceId,
        firstTime: String(sorted[0]?.time ?? ''),
        lastTime: String(sorted[sorted.length - 1]?.time ?? ''),
        entryCount: entries.length,
        errorCount: entries.filter((e) => e.level === 'error' || e.level === 'fatal').length,
        warnCount: entries.filter((e) => e.level === 'warn').length,
        jobId,
        chapterId: typeof sorted[0]?.chapterId === 'string' ? sorted[0].chapterId : undefined,
        projectId: typeof sorted[0]?.projectId === 'string' ? sorted[0].projectId : undefined,
      });
    }
  }
  return summaries.sort((a, b) => b.lastTime.localeCompare(a.lastTime));
}

export function hydrateLogEntry(entry: DebugLogEntry): void {
  writeLogEntry(entry, { skipBridge: true });
}

export function getLastErrorEntry(): DebugLogEntry | undefined {
  return getDebugLogEntriesNewestFirst().find((e) => e.level === 'error' || e.level === 'fatal');
}

export function getRecentJobIds(limit = 5, since?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of getDebugLogEntriesNewestFirst()) {
    if (since && String(e.time ?? '') < since) continue;
    const jobId = typeof e.jobId === 'string' ? e.jobId : undefined;
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);
    result.push(jobId);
    if (result.length >= limit) break;
  }
  return result;
}

export function sortLogEntries(
  entries: DebugLogEntry[],
  order: 'asc' | 'desc' = 'asc'
): DebugLogEntry[] {
  const sorted = [...entries].sort((a, b) =>
    String(a.time ?? '').localeCompare(String(b.time ?? ''))
  );
  return order === 'desc' ? sorted.reverse() : sorted;
}
