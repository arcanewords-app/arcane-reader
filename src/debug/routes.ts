/**
 * Dev-only debug log viewer routes.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { Express, Request, Response } from 'express';
import express from 'express';
import {
  getDebugLogEntries,
  getDebugLogEntriesNewestFirst,
  clearDebugLogEntries,
  getDebugTraces,
  getEntriesForCorrelation,
  getDistinctEvents,
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_DIST = path.resolve(__dirname, '../../dist/debug');

function parseBoolQuery(v: unknown): boolean {
  return v === '1' || v === 'true';
}

function parseAgentContextParams(query: Record<string, unknown>): AgentContextParams {
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  return {
    jobId: str(query.jobId),
    traceId: str(query.traceId),
    requestId: str(query.requestId),
    includePrompts:
      query.includePrompts === undefined ? true : parseBoolQuery(query.includePrompts),
    includeHttp: query.includeHttp === undefined ? true : parseBoolQuery(query.includeHttp),
    limit: parseInt(String(query.limit ?? ''), 10) || undefined,
  };
}

export function registerDebugRoutes(app: Express): void {
  if (process.env.NODE_ENV === 'production') return;

  app.get('/debug', (_req, res) => {
    const port = process.env.DEBUG_APP_PORT ?? '5174';
    res.redirect(302, `http://localhost:${port}/debug/`);
  });

  app.use('/debug', express.static(DEBUG_DIST));

  app.get('/api/debug/logs', (req, res) => {
    const newestFirst = parseBoolQuery(req.query.newestFirst);
    const entries = newestFirst ? getDebugLogEntriesNewestFirst() : getDebugLogEntries();
    res.json({
      entries,
      meta: {
        count: entries.length,
        events: getDistinctEvents(),
        workerBridge: isDebugRedisBridgeAvailable(),
        llmCapture: isLlmCaptureEnabled(),
        httpCapture: isHttpCaptureEnabled(),
        persist: isDebugPersistEnabled(),
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
    const result = buildAgentContext(parseAgentContextParams(req.query as Record<string, unknown>));
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
    const params = parseDebugQueryFromRequest(req.query as Record<string, unknown>);
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
    const params = parseDebugQueryFromRequest(req.query as Record<string, unknown>);
    const result = executeJobDebugQuery(req.params.jobId, params);
    res.json(result);
  });

  app.get('/api/debug/traces', (_req, res) => {
    res.json({ traces: getDebugTraces() });
  });

  app.get('/api/debug/traces/:id', (req, res) => {
    const id = req.params.id;
    const entries = getEntriesForCorrelation(id);
    const llmCaptures = getCapturedLlmCallsForCorrelation(id);
    const httpExchanges = getCapturedHttpExchangesForCorrelation(id);
    const summary = buildTraceDetailSummary(entries, llmCaptures, httpExchanges);
    res.json({ traceId: id, summary, entries, llmCaptures, httpExchanges });
  });

  app.get('/api/debug/export', (req, res) => {
    const format = String(req.query.format ?? 'markdown');
    const traceId = typeof req.query.traceId === 'string' ? req.query.traceId : undefined;
    const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : undefined;
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;

    let entries: DebugLogEntry[] = getDebugLogEntriesNewestFirst();
    if (traceId) entries = getEntriesForCorrelation(traceId);
    else if (jobId) entries = getEntriesForCorrelation(jobId);
    else if (requestId) entries = getEntriesForCorrelation(requestId);

    const visibleOnly = parseBoolQuery(req.query.visibleOnly);
    if (visibleOnly && typeof req.query.ids === 'string') {
      const idSet = new Set(req.query.ids.split(',').filter(Boolean));
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
