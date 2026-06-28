/**
 * Unified debug query for GET /api/debug/query
 */

import {
  queryLogEntries,
  getEntriesForCorrelation,
  getTracesForJob,
  dedupeLogEntries,
  type DebugLogEntry,
  type LogQueryFilters,
} from './buffer.js';
import {
  queryLlmCaptures,
  getCapturedLlmCallsForCorrelation,
  type CapturedLlmCall,
  type LlmQueryFilters,
} from './promptCapture.js';
import {
  queryHttpExchanges,
  getCapturedHttpExchangesForCorrelation,
  type CapturedHttpExchange,
  type HttpQueryFilters,
} from './httpCapture.js';
import { buildTraceDetailSummary } from './traceDetail.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { isLlmCaptureEnabled } from './promptCapture.js';
import { isHttpCaptureEnabled } from './httpCapture.js';
import { isDebugPersistEnabled } from './persist.js';
import { buildAgentContext, type AgentContextResponse } from './agentContext.js';
import { resolveTimeWindow } from './timeWindow.js';

export type DebugQueryFormat = 'json' | 'agent';
export type DebugQueryKind = 'logs' | 'http' | 'prompts' | 'trace' | 'all';

export interface DebugQueryParams {
  kind?: DebugQueryKind;
  traceId?: string;
  jobId?: string;
  requestId?: string;
  chapterId?: string;
  projectId?: string;
  event?: string;
  level?: string;
  process?: string;
  stage?: string;
  since?: string;
  until?: string;
  last?: string;
  q?: string;
  limit?: number;
  offset?: number;
  compact?: boolean;
  dedupe?: boolean;
  errorsOnly?: boolean;
  sort?: 'asc' | 'desc';
  format?: DebugQueryFormat;
  includePrompts?: boolean;
  detailTraces?: boolean;
}

export interface DebugQueryMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  kind: DebugQueryKind;
  workerBridge: boolean;
  captureFlags: { llm: boolean; http: boolean; persist: boolean };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function parseExcludeEvents(): string[] {
  const raw = process.env.DEBUG_QUERY_EXCLUDE?.trim();
  if (!raw) return ['http.request'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

function correlationFilters(params: DebugQueryParams): LogQueryFilters {
  const window = resolveTimeWindow({
    since: params.since,
    until: params.until,
    last: params.last,
    traceId: params.traceId,
    jobId: params.jobId,
    requestId: params.requestId,
  });
  return {
    traceId: params.traceId,
    jobId: params.jobId,
    requestId: params.requestId,
    chapterId: params.chapterId,
    projectId: params.projectId,
    since: window.since,
    until: window.until ?? params.until,
    q: params.q,
  };
}

function applyDedupe(entries: DebugLogEntry[], params: DebugQueryParams): DebugLogEntry[] {
  if (params.dedupe === false) return entries;
  return dedupeLogEntries(entries);
}

function logFilters(params: DebugQueryParams): LogQueryFilters {
  return {
    ...correlationFilters(params),
    event: params.event,
    level: params.level,
    process: params.process,
    errorsOnly: params.errorsOnly,
    excludeEvents: params.event ? [] : parseExcludeEvents(),
  };
}

function llmFilters(params: DebugQueryParams): LlmQueryFilters {
  return {
    ...correlationFilters(params),
    stage: params.stage,
  };
}

function httpFilters(params: DebugQueryParams): HttpQueryFilters {
  return {
    ...correlationFilters(params),
    errorsOnly: params.errorsOnly,
  };
}

function applySort<T extends { time?: string }>(items: T[], sort: 'asc' | 'desc' = 'desc'): T[] {
  const sorted = [...items].sort((a, b) =>
    String(a.time ?? '').localeCompare(String(b.time ?? ''))
  );
  return sort === 'desc' ? sorted.reverse() : sorted;
}

function resolveSort(params: DebugQueryParams): 'asc' | 'desc' {
  if (params.sort === 'asc' || params.sort === 'desc') return params.sort;
  return params.format === 'agent' ? 'asc' : 'desc';
}

export function executeAgentFormatQuery(
  params: DebugQueryParams
): AgentContextResponse | { error: string } {
  return buildAgentContext({
    jobId: params.jobId,
    traceId: params.traceId,
    requestId: params.requestId,
    includePrompts: params.includePrompts !== false,
    includeHttp: true,
    limit: params.limit,
    since: params.since,
    until: params.until,
    last: params.last,
    detailTraces: params.detailTraces,
  });
}

function paginate<T>(items: T[], limit: number, offset: number): { page: T[]; total: number } {
  const total = items.length;
  return { page: items.slice(offset, offset + limit), total };
}

function compactLog(entry: DebugLogEntry): DebugLogEntry {
  const {
    time,
    level,
    msg,
    process,
    traceId,
    requestId,
    jobId,
    chapterId,
    projectId,
    event,
    stage,
    ...rest
  } = entry;
  const compact: DebugLogEntry = {
    time,
    level,
    ...(msg !== undefined ? { msg } : {}),
    ...(process !== undefined ? { process } : {}),
    ...(traceId !== undefined ? { traceId } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
    ...(jobId !== undefined ? { jobId } : {}),
    ...(chapterId !== undefined ? { chapterId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(event !== undefined ? { event } : {}),
    ...(stage !== undefined ? { stage } : {}),
  };
  if ('err' in rest) compact.err = rest.err;
  if ('durationMs' in rest) compact.durationMs = rest.durationMs;
  return compact;
}

function compactLlm(
  capture: CapturedLlmCall
): Omit<CapturedLlmCall, 'systemPreview' | 'userPreview' | 'responsePreview'> {
  const {
    id,
    time,
    traceId,
    requestId,
    projectId,
    chapterId,
    jobId,
    stage,
    model,
    method,
    tokens,
    finishReason,
    reasoningTokens,
    contentLength,
    attempt,
    schemaName,
  } = capture;
  return {
    id,
    time,
    traceId,
    requestId,
    projectId,
    chapterId,
    jobId,
    stage,
    model,
    method,
    tokens,
    finishReason,
    reasoningTokens,
    contentLength,
    attempt,
    schemaName,
  };
}

function compactHttp(
  exchange: CapturedHttpExchange
): Omit<CapturedHttpExchange, 'requestPreview' | 'responsePreview'> {
  const {
    id,
    time,
    requestId,
    traceId,
    projectId,
    chapterId,
    jobId,
    method,
    path,
    statusCode,
    durationMs,
    error,
    upstreamCode,
    upstreamStatus,
    upstreamMessage,
  } = exchange;
  return {
    id,
    time,
    requestId,
    traceId,
    projectId,
    chapterId,
    jobId,
    method,
    path,
    statusCode,
    durationMs,
    error,
    upstreamCode,
    upstreamStatus,
    upstreamMessage,
  };
}

function resolveCorrelationId(params: DebugQueryParams): string | undefined {
  return params.traceId ?? params.jobId ?? params.requestId;
}

function buildMeta(
  kind: DebugQueryKind,
  total: number,
  limit: number,
  offset: number
): DebugQueryMeta {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    kind,
    workerBridge: isDebugRedisBridgeAvailable(),
    captureFlags: {
      llm: isLlmCaptureEnabled(),
      http: isHttpCaptureEnabled(),
      persist: isDebugPersistEnabled(),
    },
  };
}

export function executeDebugQuery(params: DebugQueryParams): {
  items: unknown;
  meta: DebugQueryMeta;
} {
  const kind = params.kind ?? 'logs';
  const limit = clampLimit(params.limit);
  const offset = clampOffset(params.offset);
  const compact = params.compact ?? kind === 'all';
  const sort = resolveSort(params);

  if (kind === 'logs') {
    let filtered = applySort(queryLogEntries(logFilters(params)), sort);
    filtered = applyDedupe(filtered, params);
    const { page, total } = paginate(filtered, limit, offset);
    const items = compact ? page.map(compactLog) : page;
    return { items, meta: buildMeta(kind, total, limit, offset) };
  }

  if (kind === 'prompts') {
    const window = resolveTimeWindow({
      since: params.since,
      until: params.until,
      last: params.last,
      traceId: params.traceId,
      jobId: params.jobId,
      requestId: params.requestId,
    });
    const filtered = applySort(
      queryLlmCaptures({ ...llmFilters(params), since: window.since, until: window.until }),
      sort
    );
    const { page, total } = paginate(filtered, limit, offset);
    const items = compact ? page.map(compactLlm) : page;
    return { items, meta: buildMeta(kind, total, limit, offset) };
  }

  if (kind === 'http') {
    const window = resolveTimeWindow({
      since: params.since,
      until: params.until,
      last: params.last,
      traceId: params.traceId,
      jobId: params.jobId,
      requestId: params.requestId,
    });
    const filtered = applySort(
      queryHttpExchanges({ ...httpFilters(params), since: window.since, until: window.until }),
      sort
    );
    const { page, total } = paginate(filtered, limit, offset);
    const items = compact ? page.map(compactHttp) : page;
    return { items, meta: buildMeta(kind, total, limit, offset) };
  }

  if (kind === 'trace') {
    const id = resolveCorrelationId(params);
    if (!id) {
      return {
        items: { error: 'traceId, jobId, or requestId required for kind=trace' },
        meta: buildMeta(kind, 0, limit, offset),
      };
    }
    let entries = getEntriesForCorrelation(id);
    if (params.jobId) entries = entries.filter((e) => e.jobId === params.jobId || e.traceId === id);
    if (params.chapterId) entries = entries.filter((e) => e.chapterId === params.chapterId);
    if (params.errorsOnly) {
      entries = entries.filter((e) => e.level === 'error' || e.level === 'fatal');
    }
    entries = applySort(entries, sort);
    const llmCaptures = getCapturedLlmCallsForCorrelation(id).filter((c) =>
      params.jobId ? c.jobId === params.jobId || c.traceId === id : true
    );
    const httpExchanges = getCapturedHttpExchangesForCorrelation(id).filter((e) =>
      params.jobId ? e.jobId === params.jobId || e.traceId === id : true
    );
    const summary = buildTraceDetailSummary(entries, llmCaptures, httpExchanges);
    const { page: logPage, total: logTotal } = paginate(entries, limit, offset);
    const logItems = compact ? logPage.map(compactLog) : logPage;
    const llmItems = compact ? llmCaptures.map(compactLlm) : llmCaptures;
    const httpItems = compact ? httpExchanges.map(compactHttp) : httpExchanges;
    return {
      items: {
        correlationId: id,
        summary,
        entries: logItems,
        llmCaptures: llmItems,
        httpExchanges: httpItems,
      },
      meta: { ...buildMeta(kind, logTotal, limit, offset), total: logTotal },
    };
  }

  // kind === 'all'
  const logLimit = Math.min(limit, 20);
  const promptLimit = Math.min(limit, 10);
  const httpLimit = Math.min(limit, 10);
  let logs = applySort(
    queryLogEntries({
      ...logFilters(params),
      errorsOnly: params.errorsOnly ?? false,
    }),
    sort
  );
  logs = applyDedupe(logs, params).slice(0, logLimit);
  const prompts = queryLlmCaptures(llmFilters(params)).slice(0, promptLimit);
  const http = queryHttpExchanges(httpFilters(params)).slice(0, httpLimit);
  const traces = params.jobId ? getTracesForJob(params.jobId).slice(0, 10) : [];

  return {
    items: {
      logs: compact ? logs.map(compactLog) : logs,
      prompts: compact ? prompts.map(compactLlm) : prompts,
      http: compact ? http.map(compactHttp) : http,
      traces,
    },
    meta: buildMeta(kind, logs.length + prompts.length + http.length, limit, 0),
  };
}

export function executeJobDebugQuery(
  jobId: string,
  params: DebugQueryParams
): {
  items: unknown;
  meta: DebugQueryMeta;
} {
  const limit = clampLimit(params.limit);
  const offset = clampOffset(params.offset);
  const compact = params.compact ?? true;
  const traces = getTracesForJob(jobId);
  const logs = applyDedupe(
    applySort(queryLogEntries({ jobId, ...logFilters(params) }), resolveSort(params)),
    params
  );
  const prompts = queryLlmCaptures({ jobId, ...llmFilters(params) });
  const http = queryHttpExchanges({ jobId, ...httpFilters(params) });
  const { page: logPage, total } = paginate(logs, limit, offset);

  return {
    items: {
      jobId,
      traces,
      summary: {
        traceCount: traces.length,
        logCount: logs.length,
        promptCount: prompts.length,
        httpCount: http.length,
        errorLogs: logs.filter((e) => e.level === 'error' || e.level === 'fatal').length,
      },
      logs: compact ? logPage.map(compactLog) : logPage,
      prompts: compact ? prompts.slice(0, 20).map(compactLlm) : prompts.slice(0, 20),
      http: compact ? http.slice(0, 20).map(compactHttp) : http.slice(0, 20),
    },
    meta: buildMeta('all', total, limit, offset),
  };
}

export function parseDebugQueryFromRequest(query: Record<string, unknown>): DebugQueryParams {
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const bool = (v: unknown) => v === '1' || v === 'true';
  const num = (v: unknown) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : undefined;
  };
  const kindRaw = str(query.kind);
  const kind =
    kindRaw === 'http' || kindRaw === 'prompts' || kindRaw === 'trace' || kindRaw === 'all'
      ? kindRaw
      : kindRaw === 'logs' || !kindRaw
        ? 'logs'
        : 'logs';

  const formatRaw = str(query.format);
  const format: DebugQueryFormat | undefined =
    formatRaw === 'agent' ? 'agent' : formatRaw === 'json' ? 'json' : undefined;
  const sortRaw = str(query.sort);
  const sort: 'asc' | 'desc' | undefined =
    sortRaw === 'asc' ? 'asc' : sortRaw === 'desc' ? 'desc' : undefined;

  return {
    kind,
    traceId: str(query.traceId),
    jobId: str(query.jobId),
    requestId: str(query.requestId),
    chapterId: str(query.chapterId),
    projectId: str(query.projectId),
    event: str(query.event),
    level: str(query.level),
    process: str(query.process),
    stage: str(query.stage),
    since: str(query.since),
    until: str(query.until),
    last: str(query.last),
    q: str(query.q),
    limit: num(query.limit),
    offset: num(query.offset),
    compact: query.compact !== undefined ? bool(query.compact) : undefined,
    dedupe: query.dedupe !== undefined ? bool(query.dedupe) : undefined,
    errorsOnly: bool(query.errorsOnly),
    sort,
    format,
    includePrompts: query.includePrompts !== undefined ? bool(query.includePrompts) : undefined,
    detailTraces: bool(query.detail),
  };
}
