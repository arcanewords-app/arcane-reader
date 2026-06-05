/**
 * Dev-only middleware: capture JSON API request/response previews when DEBUG_CAPTURE_HTTP=1.
 */

import type { Request, Response, NextFunction } from 'express';
import { captureHttpExchange, isHttpCaptureEnabled } from './httpCapture.js';
import { getDebugContext } from './context.js';
import { getRouteDebugError } from '../middleware/routeDebugError.js';

type RequestWithId = Request & { id?: string };

const SKIP_PATH_PREFIXES = ['/api/debug', '/debug'];

function shouldCapture(req: Request): boolean {
  if (!isHttpCaptureEnabled()) return false;
  if (!req.path.startsWith('/api/')) return false;
  for (const prefix of SKIP_PATH_PREFIXES) {
    if (req.path.startsWith(prefix)) return false;
  }
  const contentType = String(req.headers['content-type'] ?? '');
  if (contentType.includes('multipart/form-data')) return false;
  return true;
}

function getRequestId(req: RequestWithId): string {
  return req.id ?? 'unknown';
}

function getTraceId(res: Response): string | undefined {
  const locals = res.locals as { debugTraceId?: string };
  if (typeof locals.debugTraceId === 'string') return locals.debugTraceId;
  return getDebugContext()?.traceId;
}

function recordExchange(
  req: RequestWithId,
  res: Response,
  responseBody: unknown,
  start: number
): void {
  captureHttpExchange({
    requestId: getRequestId(req),
    traceId: getTraceId(res),
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    durationMs: Date.now() - start,
    requestBody: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? req.body : undefined,
    responseBody,
    upstreamCode: getRouteDebugError(res)?.upstreamCode,
    upstreamStatus: getRouteDebugError(res)?.upstreamStatus,
    upstreamMessage: getRouteDebugError(res)?.upstreamMessage,
  });
}

/**
 * Attach after requestContext. Patches res.json / res.send for eligible /api routes.
 */
export function httpCaptureMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!shouldCapture(req)) {
    next();
    return;
  }

  const start = Date.now();
  let captured = false;

  const finishCapture = (body: unknown) => {
    if (captured) return;
    captured = true;
    recordExchange(req as RequestWithId, res, body, start);
  };

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function jsonCapture(this: Response, body?: unknown) {
    finishCapture(body);
    return originalJson(body);
  };

  res.send = function sendCapture(this: Response, body?: unknown) {
    if (typeof body === 'string') {
      try {
        finishCapture(JSON.parse(body));
      } catch {
        finishCapture(body);
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        finishCapture(JSON.parse(body.toString('utf8')));
      } catch {
        finishCapture(body.toString('utf8'));
      }
    } else {
      finishCapture(body);
    }
    return originalSend(body);
  };

  res.on('finish', () => {
    if (!captured) finishCapture(undefined);
  });

  next();
}

/** Set trace id on response locals so HTTP capture links to pipeline trace. */
export function setDebugTraceId(res: Response, traceId: string): void {
  (res.locals as { debugTraceId?: string }).debugTraceId = traceId;
}
