/**
 * Opt-in capture of LLM request/response previews for /debug (dev only).
 */

import { getDebugContext } from './context.js';

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
  method: 'complete' | 'completeJSON' | 'completeStructuredJSON';
  systemPreview: string;
  userPreview: string;
  responsePreview: string;
  tokens?: { prompt: number; completion: number; total: number };
  finishReason?: string | null;
  reasoningTokens?: number | null;
  contentLength?: number;
  attempt?: number;
  schemaName?: string;
}

const MAX_CAPTURES = 20;
const DEFAULT_MAX_CHARS = 4096;

const buffer: CapturedLlmCall[] = [];
let captureIndex = 0;

function maxCaptures(): number {
  const n = parseInt(process.env.DEBUG_CAPTURE_LLM_MAX ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_CAPTURES;
}

function maxChars(): number {
  const n = parseInt(process.env.DEBUG_CAPTURE_LLM_MAX_CHARS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CHARS;
}

export function isLlmCaptureEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    (process.env.DEBUG_CAPTURE_LLM === '1' || process.env.DEBUG_CAPTURE_LLM === 'true')
  );
}

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `\n… [truncated ${s.length - limit} chars]`;
}

export function captureLlmCall(params: {
  model: string;
  method: 'complete' | 'completeJSON' | 'completeStructuredJSON';
  messages: Array<{ role: string; content: string }>;
  responseContent: string;
  tokens?: { prompt: number; completion: number; total: number };
  stage?: string;
  finishReason?: string | null;
  reasoningTokens?: number | null;
  contentLength?: number;
  attempt?: number;
  schemaName?: string;
}): void {
  if (!isLlmCaptureEnabled()) return;

  const limit = maxChars();
  const systemParts = params.messages.filter((m) => m.role === 'system').map((m) => m.content);
  const userParts = params.messages.filter((m) => m.role === 'user').map((m) => m.content);
  const ctx = getDebugContext();

  const entry: CapturedLlmCall = {
    id: `llm-${Date.now()}-${captureIndex++}`,
    time: new Date().toISOString(),
    traceId: ctx?.traceId,
    requestId: ctx?.requestId,
    projectId: ctx?.projectId,
    chapterId: ctx?.chapterId,
    jobId: ctx?.jobId,
    stage: params.stage ?? ctx?.stage,
    model: params.model,
    method: params.method,
    systemPreview: truncate(systemParts.join('\n\n---\n\n') || '(no system)', limit),
    userPreview: truncate(userParts.join('\n\n---\n\n') || '(no user)', limit),
    responsePreview: truncate(params.responseContent || '(empty)', limit),
    tokens: params.tokens,
    finishReason: params.finishReason,
    reasoningTokens: params.reasoningTokens,
    contentLength: params.contentLength ?? params.responseContent?.length ?? 0,
    attempt: params.attempt,
    schemaName: params.schemaName,
  };

  const max = maxCaptures();
  if (buffer.length >= max) buffer.shift();
  buffer.push(entry);
}

export function getCapturedLlmCalls(): CapturedLlmCall[] {
  return [...buffer].reverse();
}

export function getCapturedLlmCallsForCorrelation(id: string): CapturedLlmCall[] {
  return buffer.filter((e) => e.traceId === id || e.jobId === id || e.requestId === id);
}

export function clearCapturedLlmCalls(): void {
  buffer.length = 0;
}
