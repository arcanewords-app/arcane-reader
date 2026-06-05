/**
 * Build unified trace detail for GET /api/debug/traces/:id
 */

import type { DebugLogEntry } from './buffer.js';
import type { CapturedLlmCall } from './promptCapture.js';
import type { CapturedHttpExchange } from './httpCapture.js';

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

export function buildTraceDetailSummary(
  entries: DebugLogEntry[],
  llmCaptures: CapturedLlmCall[],
  httpExchanges: CapturedHttpExchange[]
): TraceDetailSummary {
  const sorted = [...entries].sort((a, b) =>
    String(a.time ?? '').localeCompare(String(b.time ?? ''))
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let durationMs = 0;
  if (first?.time && last?.time) {
    durationMs = Math.max(
      0,
      new Date(String(last.time)).getTime() - new Date(String(first.time)).getTime()
    );
  }

  const stages = new Set<string>();
  for (const e of entries) {
    if (typeof e.stage === 'string' && e.stage) stages.add(e.stage);
    if (typeof e.event === 'string') {
      if (e.event.startsWith('pipeline.') || e.event.startsWith('translation.')) {
        stages.add(e.event);
      }
    }
  }

  let totalLlmTokens = 0;
  for (const c of llmCaptures) {
    if (c.tokens?.total) totalLlmTokens += c.tokens.total;
  }

  return {
    durationMs,
    errorCount: entries.filter((e) => e.level === 'error' || e.level === 'fatal').length,
    warnCount: entries.filter((e) => e.level === 'warn').length,
    entryCount: entries.length,
    stages: [...stages].sort(),
    totalLlmTokens,
    httpExchangeCount: httpExchanges.length,
    llmCaptureCount: llmCaptures.length,
  };
}
