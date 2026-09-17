/**
 * Request context: request ID and request-scoped logger.
 * Prepares for cloud logging (correlation by requestId).
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { logger, createRequestLogger, flushLogs } from '../logger.js';
import { runWithAbortSignal } from '../shared/invocationAbort.js';
import { getRouteDebugError } from './routeDebugError.js';

const REQUEST_ID_HEADER = 'x-request-id';

function scheduleLogFlush(): void {
  const pending = flushLogs().catch(() => {});
  if (process.env.VERCEL) waitUntil(pending);
}

/**
 * Attach requestId and req.log to the request.
 * Reads X-Request-Id from client or generates a new one; sets X-Request-Id on response.
 * Binds an AbortSignal for the invocation so OpenAI calls abort when the client disconnects.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers[REQUEST_ID_HEADER] as string) || randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const userId = req.user?.id;
  (req as Request & { log: ReturnType<typeof createRequestLogger> }).log = createRequestLogger({
    requestId,
    ...(userId && { userId }),
  });

  const controller = new AbortController();
  const abortIfClientGone = (): void => {
    if (res.writableEnded || controller.signal.aborted) return;
    controller.abort();
  };
  // IncomingMessage 'close' also fires after a fully-read POST body while the
  // handler is still running — that is not a client disconnect.
  req.on('close', () => {
    if (req.complete) return;
    abortIfClientGone();
  });
  res.on('close', abortIfClientGone);

  runWithAbortSignal(controller.signal, () => {
    next();
  });
}

/**
 * Log each HTTP request: method, path, statusCode, durationMs.
 * Use after requestContext so req.log is available. Logs in English.
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const log = (req as Request & { log: ReturnType<typeof createRequestLogger> }).log ?? logger;

  res.on('finish', () => {
    // Skip logging debug viewer traffic (polling and page) to avoid noise
    if (
      req.path.startsWith('/api/debug') ||
      req.path === '/debug' ||
      req.path.startsWith('/debug/')
    ) {
      return;
    }
    const durationMs = Date.now() - start;
    const userId = req.user?.id;
    const routeErr = getRouteDebugError(res);
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const event = routeErr?.event ?? 'http.request';

    const payload: Record<string, unknown> = {
      event,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs,
      ...(userId && { userId }),
    };

    if (routeErr) {
      payload.clientMessage = routeErr.clientMessage;
      if (routeErr.operation) payload.operation = routeErr.operation;
      if (routeErr.upstreamCode) payload.upstreamCode = routeErr.upstreamCode;
      if (routeErr.upstreamStatus !== undefined) payload.upstreamStatus = routeErr.upstreamStatus;
      if (routeErr.upstreamMessage) payload.upstreamMessage = routeErr.upstreamMessage;
    }

    log[level](
      payload,
      routeErr?.clientMessage ?? `${req.method} ${req.path} ${statusCode} ${durationMs}ms`
    );

    // Serverless: flush Axiom batch before function freeze (never block response)
    scheduleLogFlush();
  });

  res.on('close', () => {
    scheduleLogFlush();
  });

  next();
}
