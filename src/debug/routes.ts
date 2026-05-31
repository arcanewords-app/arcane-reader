/**
 * Dev-only debug log viewer routes.
 */

import type { Express, Request, Response } from 'express';
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
} from './copyFormat.js';
import {
  getCapturedLlmCalls,
  clearCapturedLlmCalls,
  isLlmCaptureEnabled,
} from './promptCapture.js';
import { isDebugRedisBridgeAvailable } from './redisBridge.js';
import { renderDebugViewerHtml } from './viewer.js';

function parseBoolQuery(v: unknown): boolean {
  return v === '1' || v === 'true';
}

export function registerDebugRoutes(app: Express): void {
  if (process.env.NODE_ENV === 'production') return;

  app.get('/debug', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDebugViewerHtml());
  });

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
      },
    });
  });

  app.get('/api/debug/traces', (_req, res) => {
    res.json({ traces: getDebugTraces() });
  });

  app.get('/api/debug/traces/:id', (req, res) => {
    const entries = getEntriesForCorrelation(req.params.id);
    res.json({ traceId: req.params.id, entries });
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

  app.get('/debug/clear', (_req, res) => {
    clearDebugLogEntries();
    res.redirect(302, '/debug');
  });

  app.get('/debug/clear-prompts', (_req, res) => {
    clearCapturedLlmCalls();
    res.redirect(302, '/debug#prompts');
  });

  app.post('/api/debug/clear', (_req: Request, res: Response) => {
    clearDebugLogEntries();
    res.json({ ok: true });
  });
}
