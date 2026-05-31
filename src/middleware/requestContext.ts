/**
 * Request context: request ID and request-scoped logger.
 * Prepares for cloud logging (correlation by requestId).
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger, createRequestLogger } from '../logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attach requestId and req.log to the request.
 * Reads X-Request-Id from client or generates a new one; sets X-Request-Id on response.
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

  next();
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
    log.info(
      {
        event: 'http.request',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        ...(userId && { userId }),
      },
      `${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`
    );
  });

  next();
}
