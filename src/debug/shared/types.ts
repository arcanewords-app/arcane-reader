/**
 * Shared debug types (browser-safe, used by debug-app and server).
 */

export interface DebugLogEntry {
  time: string;
  level: string;
  msg?: string;
  process?: 'api' | 'worker';
  traceId?: string;
  requestId?: string;
  projectId?: string;
  chapterId?: string;
  jobId?: string;
  event?: string;
  stage?: string;
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

export interface CapturedLlmCall {
  id: string;
  time: string;
  traceId?: string;
  requestId?: string;
  projectId?: string;
  chapterId?: string;
  jobId?: string;
  stage?: string;
  model: string;
  method: 'complete' | 'completeJSON';
  systemPreview: string;
  userPreview: string;
  responsePreview: string;
  tokens?: { prompt: number; completion: number; total: number };
}

export interface TraceDetailSummary {
  durationMs: number;
  errorCount: number;
  warnCount: number;
  entryCount: number;
  stages: string[];
  totalLlmTokens: number;
  httpExchangeCount: number;
  llmCaptureCount: number;
}

export interface LogsResponse {
  entries: DebugLogEntry[];
  meta: {
    count: number;
    events: string[];
    workerBridge: boolean;
    llmCapture: boolean;
    httpCapture: boolean;
  };
}

export interface TraceDetailResponse {
  traceId: string;
  summary: TraceDetailSummary;
  entries: DebugLogEntry[];
  llmCaptures: CapturedLlmCall[];
  httpExchanges: CapturedHttpExchange[];
}

export type DebugTab = 'logs' | 'traces' | 'http' | 'prompts';

export const LEVEL_COLORS: Record<string, string> = {
  fatal: 'var(--dbg-error)',
  error: 'var(--dbg-error)',
  warn: 'var(--dbg-warn)',
  info: 'var(--dbg-success)',
  debug: 'var(--dbg-accent)',
  trace: '#6b7280',
};

export const SLOW_HTTP_MS = 2000;
