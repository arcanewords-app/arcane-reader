/**
 * Opt-in capture of HTTP request/response previews for /debug (dev only).
 */

import { getDebugContext } from './context.js';

export interface CapturedHttpExchange {
  id: string;
  time: string;
  requestId: string;
  traceId?: string;
  projectId?: string;
  chapterId?: string;
  jobId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestPreview?: string;
  responsePreview?: string;
  error?: string;
  upstreamCode?: string;
  upstreamStatus?: number;
  upstreamMessage?: string;
}

const MAX_CAPTURES = 50;
const DEFAULT_MAX_CHARS = 8192;

const REDACT_KEYS = new Set([
  'password',
  'token',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'access_token',
]);

const buffer: CapturedHttpExchange[] = [];
let captureIndex = 0;

function maxCaptures(): number {
  const n = parseInt(process.env.DEBUG_CAPTURE_HTTP_MAX ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_CAPTURES;
}

function maxChars(): number {
  const n = parseInt(process.env.DEBUG_CAPTURE_HTTP_MAX_CHARS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CHARS;
}

export function isHttpCaptureEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    (process.env.DEBUG_CAPTURE_HTTP === '1' || process.env.DEBUG_CAPTURE_HTTP === 'true')
  );
}

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `\n… [truncated ${s.length - limit} chars]`;
}

function redactValue(key: string, value: unknown): unknown {
  if (REDACT_KEYS.has(key.toLowerCase())) return '[REDACTED]';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? redactObject(item as Record<string, unknown>)
        : item
    );
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

export function previewJsonBody(body: unknown, limit?: number): string | undefined {
  if (body === undefined || body === null) return undefined;
  const charLimit = limit ?? maxChars();
  try {
    const redacted =
      typeof body === 'object' ? redactObject(body as Record<string, unknown>) : body;
    const json = JSON.stringify(redacted, null, 2);
    return truncate(json, charLimit);
  } catch {
    return truncate(String(body), charLimit);
  }
}

function extractError(responseBody: unknown): string | undefined {
  if (!responseBody || typeof responseBody !== 'object') return undefined;
  const err = (responseBody as Record<string, unknown>).error;
  return typeof err === 'string' ? err : undefined;
}

export function captureHttpExchange(params: {
  requestId: string;
  traceId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  upstreamCode?: string;
  upstreamStatus?: number;
  upstreamMessage?: string;
}): void {
  if (!isHttpCaptureEnabled()) return;

  const ctx = getDebugContext();
  const entry: CapturedHttpExchange = {
    id: `http-${Date.now()}-${captureIndex++}`,
    time: new Date().toISOString(),
    requestId: params.requestId,
    traceId: params.traceId ?? ctx?.traceId,
    projectId: ctx?.projectId,
    chapterId: ctx?.chapterId,
    jobId: ctx?.jobId,
    method: params.method,
    path: params.path,
    statusCode: params.statusCode,
    durationMs: params.durationMs,
    requestPreview: previewJsonBody(params.requestBody),
    responsePreview: previewJsonBody(params.responseBody),
    error: extractError(params.responseBody),
    upstreamCode: params.upstreamCode,
    upstreamStatus: params.upstreamStatus,
    upstreamMessage: params.upstreamMessage,
  };

  pushCapturedHttpExchange(entry);
}

function pushCapturedHttpExchange(
  entry: CapturedHttpExchange,
  options?: { skipBridge?: boolean }
): void {
  const max = maxCaptures();
  if (buffer.length >= max) buffer.shift();
  buffer.push(entry);

  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.RUN_AS_WORKER === '1' &&
    !options?.skipBridge
  ) {
    void import('./redisBridge.js').then(({ publishDebugBridgeMessage }) => {
      publishDebugBridgeMessage({ kind: 'http', exchange: entry });
    });
  }

  if (process.env.NODE_ENV !== 'production' && process.env.RUN_AS_WORKER !== '1') {
    void import('./persist.js').then(({ appendPersistRecord }) => {
      appendPersistRecord('http', entry);
    });
  }
}

export function importBridgedHttpExchange(exchange: CapturedHttpExchange): void {
  if (!isHttpCaptureEnabled()) return;
  pushCapturedHttpExchange(exchange, { skipBridge: true });
}

export function getCapturedHttpExchanges(): CapturedHttpExchange[] {
  return [...buffer].reverse();
}

export function getCapturedHttpExchangesForCorrelation(id: string): CapturedHttpExchange[] {
  return buffer.filter((e) => e.traceId === id || e.requestId === id || e.jobId === id);
}

export function clearCapturedHttpExchanges(): void {
  buffer.length = 0;
}

export interface HttpQueryFilters {
  traceId?: string;
  jobId?: string;
  requestId?: string;
  chapterId?: string;
  projectId?: string;
  since?: string;
  until?: string;
  q?: string;
  errorsOnly?: boolean;
}

export function queryHttpExchanges(filters: HttpQueryFilters = {}): CapturedHttpExchange[] {
  const qLower = filters.q?.toLowerCase();
  return getCapturedHttpExchanges().filter((e) => {
    if (filters.traceId && e.traceId !== filters.traceId) return false;
    if (filters.jobId && e.jobId !== filters.jobId) return false;
    if (filters.requestId && e.requestId !== filters.requestId) return false;
    if (filters.chapterId && e.chapterId !== filters.chapterId) return false;
    if (filters.projectId && e.projectId !== filters.projectId) return false;
    if (filters.since && e.time < filters.since) return false;
    if (filters.until && e.time > filters.until) return false;
    if (filters.errorsOnly && e.statusCode < 400) return false;
    if (qLower) {
      const hay = [e.method, e.path, e.error, e.requestPreview, e.responsePreview]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
}

export function hydrateHttpExchange(exchange: CapturedHttpExchange): void {
  pushCapturedHttpExchange(exchange, { skipBridge: true });
}
