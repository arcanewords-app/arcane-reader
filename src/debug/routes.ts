/**
 * Dev-only debug log viewer routes.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { Application, Request, Response } from 'express';
import express from 'express';
import {
  getDebugLogEntriesNewestFirst,
  clearDebugLogEntries,
  getDebugTraces,
  getEntriesForCorrelation,
  getDistinctEvents,
  queryLogEntries,
  dedupeLogEntries,
  type DebugLogEntry,
} from './buffer.js';
import {
  formatEntryMarkdown,
  formatEntriesMarkdown,
  formatEntriesJson,
  formatForCursor,
  formatTraceForCursor,
  formatHttpExchangesMarkdown,
} from './copyFormat.js';
import {
  getCapturedLlmCalls,
  getCapturedLlmCallsForCorrelation,
  clearCapturedLlmCalls,
  isLlmCaptureEnabled,
} from './promptCapture.js';
import {
  getCapturedHttpExchanges,
  getCapturedHttpExchangesForCorrelation,
  clearCapturedHttpExchanges,
  isHttpCaptureEnabled,
} from './httpCapture.js';
import { buildTraceDetailSummary } from './traceDetail.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { checkDebugQueryRateLimit } from './rateLimit.js';
import {
  executeDebugQuery,
  executeJobDebugQuery,
  executeAgentFormatQuery,
  parseDebugQueryFromRequest,
} from './query.js';
import { isDebugPersistEnabled } from './persist.js';
import { buildAgentContext, type AgentContextParams } from './agentContext.js';
import { getDebugStatus } from './debugStatus.js';
import { getDebugCatalog } from './catalog.js';
import { resolveTimeWindow } from './timeWindow.js';
import {
  normalizeQueryRecord,
  normalizeQueryValue,
  requireRouteParam,
} from '../api/validateRoute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_DIST = path.resolve(__dirname, '../../dist/debug');

function parseBoolQuery(v: unknown): boolean {
  const s = normalizeQueryValue(v);
  return s === '1' || s === 'true';
}

function parseAgentContextParams(query: Record<string, unknown>): AgentContextParams {
  const str = (v: unknown) => {
    const s = normalizeQueryValue(v);
    return s && s.length > 0 ? s : undefined;
  };
  return {
    jobId: str(query.jobId),
    traceId: str(query.traceId),
    requestId: str(query.requestId),
    includePrompts:
      query.includePrompts === undefined ? true : parseBoolQuery(query.includePrompts),
    includeHttp: query.includeHttp === undefined ? true : parseBoolQuery(query.includeHttp),
    limit: parseInt(normalizeQueryValue(query.limit) ?? '', 10) || undefined,
    since: str(query.since),
    until: str(query.until),
    last: str(query.last),
    detailTraces: parseBoolQuery(query.detail),
  };
}

export function registerDebugRoutes(app: Application): void {
  if (process.env.NODE_ENV === 'production') return;

  app.get('/debug', (_req, res) => {
    const port = process.env.DEBUG_APP_PORT ?? '5174';
    res.redirect(302, `http://localhost:${port}/debug/`);
  });

  app.use('/debug', express.static(DEBUG_DIST));

  app.get('/api/debug/logs', (req, res) => {
    const newestFirst = parseBoolQuery(req.query.newestFirst);
    const q = normalizeQueryRecord(req.query as Record<string, unknown>);
    const str = (v: unknown) => {
      const s = normalizeQueryValue(v);
      return s && s.length > 0 ? s : undefined;
    };
    const window = resolveTimeWindow({
      since: str(q.since),
      until: str(q.until),
      last: str(q.last),
      traceId: str(q.traceId),
      jobId: str(q.jobId),
      requestId: str(q.requestId),
    });
    let entries = queryLogEntries({
      since: window.since,
      until: window.until,
      traceId: str(q.traceId),
      jobId: str(q.jobId),
      requestId: str(q.requestId),
    });
    entries = dedupeLogEntries(entries);
    if (!newestFirst) {
      entries = [...entries].reverse();
    }
    res.json({
      entries,
      meta: {
        count: entries.length,
        events: getDistinctEvents(),
        workerBridge: isDebugRedisBridgeAvailable(),
        llmCapture: isLlmCaptureEnabled(),
        httpCapture: isHttpCaptureEnabled(),
        persist: isDebugPersistEnabled(),
        window: window.lastApplied ? { last: window.lastApplied, since: window.since } : undefined,
      },
    });
  });

  app.get('/api/debug/status', (_req, res) => {
    res.json(getDebugStatus());
  });

  app.get('/api/debug/catalog', (_req, res) => {
    res.json(getDebugCatalog());
  });

  app.get('/api/debug/agent/context', (req, res) => {
    const rate = checkDebugQueryRateLimit(req.ip);
    if (!rate.allowed) {
      res.status(429).json({
        error: 'Too many debug queries',
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }
    const result = buildAgentContext(
      parseAgentContextParams(normalizeQueryRecord(req.query as Record<string, unknown>))
    );
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.get('/api/debug/query', (req, res) => {
    const rate = checkDebugQueryRateLimit(req.ip);
    if (!rate.allowed) {
      res.status(429).json({
        error: 'Too many debug queries',
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }
    const params = parseDebugQueryFromRequest(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (params.format === 'agent') {
      const agent = executeAgentFormatQuery(params);
      if ('error' in agent) {
        res.status(400).json(agent);
        return;
      }
      res.json(agent);
      return;
    }
    const result = executeDebugQuery(params);
    res.json(result);
  });

  app.get('/api/debug/jobs/:jobId', (req, res) => {
    const rate = checkDebugQueryRateLimit(req.ip);
    if (!rate.allowed) {
      res.status(429).json({
        error: 'Too many debug queries',
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }
    const params = parseDebugQueryFromRequest(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    const result = executeJobDebugQuery(requireRouteParam(req.params.jobId, 'jobId'), params);
    res.json(result);
  });

  app.get('/api/debug/traces', (_req, res) => {
    res.json({ traces: getDebugTraces() });
  });

  app.get('/api/debug/traces/:id', (req, res) => {
    const id = requireRouteParam(req.params.id, 'id');
    const entries = getEntriesForCorrelation(id);
    const llmCaptures = getCapturedLlmCallsForCorrelation(id);
    const httpExchanges = getCapturedHttpExchangesForCorrelation(id);
    const summary = buildTraceDetailSummary(entries, llmCaptures, httpExchanges);
    res.json({ traceId: id, summary, entries, llmCaptures, httpExchanges });
  });

  app.get('/api/debug/export', (req, res) => {
    const format = normalizeQueryValue(req.query.format) ?? 'markdown';
    const traceId = normalizeQueryValue(req.query.traceId);
    const requestId = normalizeQueryValue(req.query.requestId);
    const jobId = normalizeQueryValue(req.query.jobId);

    let entries: DebugLogEntry[] = getDebugLogEntriesNewestFirst();
    if (traceId) entries = getEntriesForCorrelation(traceId);
    else if (jobId) entries = getEntriesForCorrelation(jobId);
    else if (requestId) entries = getEntriesForCorrelation(requestId);

    const visibleOnly = parseBoolQuery(req.query.visibleOnly);
    if (visibleOnly && normalizeQueryValue(req.query.ids)) {
      const idSet = new Set((normalizeQueryValue(req.query.ids) ?? '').split(',').filter(Boolean));
      entries = entries.filter((_, i) => idSet.has(String(i)));
    }

    if (format === 'json') {
      res.type('application/json').send(formatEntriesJson(entries));
      return;
    }
    if (format === 'cursor') {
      res.type('text/plain').send(formatForCursor(entries));
      return;
    }
    if (format === 'trace' && traceId) {
      const traceEntries = getEntriesForCorrelation(traceId);
      const llmCaptures = getCapturedLlmCallsForCorrelation(traceId);
      const httpExchanges = getCapturedHttpExchangesForCorrelation(traceId);
      const summary = buildTraceDetailSummary(traceEntries, llmCaptures, httpExchanges);
      res.type('text/plain').send(
        formatTraceForCursor({
          traceId,
          summary,
          entries: traceEntries,
          llmCaptures,
          httpExchanges,
        })
      );
      return;
    }
    if (format === 'http') {
      const captures = getCapturedHttpExchanges();
      res.type('text/plain').send(formatHttpExchangesMarkdown(captures, 'Arcane HTTP captures'));
      return;
    }
    if (format === 'row' && entries.length === 1) {
      res.type('text/plain').send(formatEntryMarkdown(entries[0]));
      return;
    }
    res.type('text/plain').send(formatEntriesMarkdown(entries, 'Arcane debug export'));
  });

  app.get('/api/debug/prompts', (_req, res) => {
    res.json({
      enabled: isLlmCaptureEnabled(),
      captures: getCapturedLlmCalls(),
    });
  });

  app.get('/api/debug/http', (_req, res) => {
    res.json({
      enabled: isHttpCaptureEnabled(),
      captures: getCapturedHttpExchanges(),
    });
  });

  app.get('/debug/clear', (_req, res) => {
    clearDebugLogEntries();
    res.redirect(302, '/debug');
  });

  app.get('/debug/clear-prompts', (_req, res) => {
    clearCapturedLlmCalls();
    res.redirect(302, '/debug?tab=prompts');
  });

  app.get('/debug/clear-http', (_req, res) => {
    clearCapturedHttpExchanges();
    res.redirect(302, '/debug?tab=http');
  });

  app.post('/api/debug/clear', (_req: Request, res: Response) => {
    clearDebugLogEntries();
    res.json({ ok: true });
  });

  app.post('/api/debug/clear-http', (_req: Request, res: Response) => {
    clearCapturedHttpExchanges();
    res.json({ ok: true });
  });

  app.post('/api/debug/clear-prompts', (_req: Request, res: Response) => {
    clearCapturedLlmCalls();
    res.json({ ok: true });
  });
}
