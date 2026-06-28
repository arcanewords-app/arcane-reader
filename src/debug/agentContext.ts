/**
 * Agent-oriented debug context (markdown + code hints).
 */

import {
  getEntriesForCorrelation,
  getTracesForJob,
  queryLogEntries,
  sortLogEntries,
  dedupeLogEntries,
  type DebugLogEntry,
  type LogQueryFilters,
} from './buffer.js';
import {
  getCapturedLlmCallsForCorrelation,
  queryLlmCaptures,
  isLlmCaptureEnabled,
} from './promptCapture.js';
import {
  getCapturedHttpExchangesForCorrelation,
  queryHttpExchanges,
  isHttpCaptureEnabled,
} from './httpCapture.js';
import { buildTraceDetailSummary } from './traceDetail.js';
import {
  formatEntriesMarkdown,
  formatTraceForCursor,
  formatLlmCaptureMarkdown,
  formatHttpExchangesMarkdown,
  getCodeHintsForEntries,
} from './copyFormat.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { isDebugPersistEnabled } from './persist.js';
import { resolveTimeWindow } from './timeWindow.js';

const DEFAULT_LOG_LIMIT = 500;

export interface AgentContextParams {
  jobId?: string;
  traceId?: string;
  requestId?: string;
  includePrompts?: boolean;
  includeHttp?: boolean;
  limit?: number;
  since?: string;
  until?: string;
  last?: string;
  /** Include per-trace sections for multi-chapter jobs (default false) */
  detailTraces?: boolean;
}

export interface AgentContextResponse {
  format: 'markdown';
  correlation: {
    jobId?: string;
    traceId?: string;
    requestId?: string;
    traceIds: string[];
  };
  summary: {
    logCount: number;
    errorCount: number;
    warnCount: number;
    promptCount: number;
    httpCount: number;
    traceCount: number;
  };
  markdown: string;
  codeHints: string[];
  meta: {
    workerBridge: boolean;
    captureFlags: { llm: boolean; http: boolean; persist: boolean };
    truncated: boolean;
  };
}

function parseExcludeEvents(): string[] {
  const raw = process.env.DEBUG_QUERY_EXCLUDE?.trim();
  if (!raw) return ['http.request'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LOG_LIMIT;
  return Math.min(Math.floor(limit), DEFAULT_LOG_LIMIT);
}

function buildMeta(truncated: boolean) {
  return {
    workerBridge: isDebugRedisBridgeAvailable(),
    captureFlags: {
      llm: isLlmCaptureEnabled(),
      http: isHttpCaptureEnabled(),
      persist: isDebugPersistEnabled(),
    },
    truncated,
  };
}

function agentLogFilters(params: AgentContextParams): LogQueryFilters {
  const correlation = {
    jobId: params.jobId,
    traceId: params.traceId,
    requestId: params.requestId,
  };
  const window = resolveTimeWindow({
    since: params.since,
    until: params.until,
    last: params.last,
    ...correlation,
    applyDefault: false,
  });
  return {
    ...correlation,
    since: window.since,
    until: window.until,
    excludeEvents: parseExcludeEvents(),
  };
}

function fetchAgentLogs(params: AgentContextParams): DebugLogEntry[] {
  return dedupeLogEntries(sortLogEntries(queryLogEntries(agentLogFilters(params)), 'asc'));
}

function buildJobContext(params: AgentContextParams): AgentContextResponse {
  const jobId = params.jobId!;
  const limit = clampLimit(params.limit);
  const includePrompts = params.includePrompts !== false;
  const includeHttp = params.includeHttp !== false;

  const logs = fetchAgentLogs(params);
  const truncated = logs.length > limit;
  const logPage = truncated ? logs.slice(-limit) : logs;

  const prompts = includePrompts ? queryLlmCaptures({ jobId }) : [];
  const http = includeHttp ? queryHttpExchanges({ jobId }) : [];
  const traces = getTracesForJob(jobId);
  const traceIds = traces.map((t) => t.traceId);

  const errorCount = logs.filter((e) => e.level === 'error' || e.level === 'fatal').length;
  const warnCount = logs.filter((e) => e.level === 'warn').length;

  const sections: string[] = [
    `# Arcane debug context — job ${jobId}`,
    '',
    '### Summary',
    `- traces (chapters): ${traces.length}`,
    `- logs: ${logs.length}${truncated ? ` (showing last ${limit})` : ''}`,
    `- errors: ${errorCount}`,
    `- warnings: ${warnCount}`,
    `- llm captures: ${prompts.length}`,
    `- http captures: ${http.length}`,
    '',
  ];

  if (traces.length > 0) {
    sections.push('### Traces in job', '');
    for (const t of traces) {
      sections.push(
        `- \`${t.traceId}\` chapter=${t.chapterId ?? '—'} entries=${t.entryCount} errors=${t.errorCount}`
      );
    }
    sections.push('');
  }

  sections.push(formatEntriesMarkdown(logPage, `Job ${jobId} timeline`, { timelineOrder: 'asc' }));

  if (params.detailTraces && traces.length > 1) {
    sections.push('', '### Per-trace detail', '');
    for (const t of traces.slice(0, 10)) {
      const traceEntries = sortLogEntries(
        getEntriesForCorrelation(t.traceId).filter((e) => e.jobId === jobId),
        'asc'
      );
      if (traceEntries.length === 0) continue;
      const llm = includePrompts ? getCapturedLlmCallsForCorrelation(t.traceId) : [];
      const hx = includeHttp ? getCapturedHttpExchangesForCorrelation(t.traceId) : [];
      const summary = buildTraceDetailSummary(traceEntries, llm, hx);
      sections.push(
        formatTraceForCursor({
          traceId: t.traceId,
          summary,
          entries: traceEntries,
          llmCaptures: llm,
          httpExchanges: hx,
          timelineOrder: 'asc',
        })
      );
    }
  } else if (includePrompts && prompts.length > 0) {
    sections.push('', '### LLM calls', '');
    for (const c of prompts) {
      sections.push(formatLlmCaptureMarkdown(c));
    }
  }

  if (includeHttp && http.length > 0 && traces.length <= 1) {
    sections.push(formatHttpExchangesMarkdown(http, 'HTTP captures'));
  }

  const markdown = sections.join('\n');
  const codeHints = getCodeHintsForEntries(logs);

  return {
    format: 'markdown',
    correlation: { jobId, traceIds },
    summary: {
      logCount: logs.length,
      errorCount,
      warnCount,
      promptCount: prompts.length,
      httpCount: http.length,
      traceCount: traces.length,
    },
    markdown,
    codeHints,
    meta: buildMeta(truncated),
  };
}

function buildSingleCorrelationContext(
  id: string,
  params: AgentContextParams,
  correlation: { jobId?: string; traceId?: string; requestId?: string }
): AgentContextResponse {
  const includePrompts = params.includePrompts !== false;
  const includeHttp = params.includeHttp !== false;
  const limit = clampLimit(params.limit);

  let entries = fetchAgentLogs(params);
  if (entries.length === 0) {
    entries = dedupeLogEntries(sortLogEntries(getEntriesForCorrelation(id), 'asc'));
  }

  const truncated = entries.length > limit;
  const logPage = truncated ? entries.slice(-limit) : entries;

  const llmCaptures = includePrompts ? getCapturedLlmCallsForCorrelation(id) : [];
  const httpExchanges = includeHttp ? getCapturedHttpExchangesForCorrelation(id) : [];
  const summary = buildTraceDetailSummary(entries, llmCaptures, httpExchanges);

  const traceIds = new Set<string>();
  for (const e of entries) {
    if (typeof e.traceId === 'string' && e.traceId) traceIds.add(e.traceId);
  }

  const markdown = formatTraceForCursor({
    traceId: correlation.traceId ?? correlation.requestId ?? id,
    summary,
    entries: logPage,
    llmCaptures,
    httpExchanges,
    timelineOrder: 'asc',
  });

  return {
    format: 'markdown',
    correlation: {
      ...correlation,
      traceIds: [...traceIds],
    },
    summary: {
      logCount: entries.length,
      errorCount: summary.errorCount,
      warnCount: summary.warnCount,
      promptCount: llmCaptures.length,
      httpCount: httpExchanges.length,
      traceCount: traceIds.size || 1,
    },
    markdown,
    codeHints: getCodeHintsForEntries(entries),
    meta: buildMeta(truncated),
  };
}

export function buildAgentContext(
  params: AgentContextParams
): AgentContextResponse | { error: string } {
  const { jobId, traceId, requestId } = params;
  const idCount = [jobId, traceId, requestId].filter(Boolean).length;
  if (idCount === 0) {
    return { error: 'One of jobId, traceId, or requestId is required' };
  }
  if (idCount > 1) {
    return { error: 'Provide only one of jobId, traceId, or requestId' };
  }

  if (jobId) return buildJobContext(params);
  if (traceId) return buildSingleCorrelationContext(traceId, params, { traceId });
  return buildSingleCorrelationContext(requestId!, params, { requestId });
}
