/**
 * Service Health Error Middleware
 *
 * Catches Supabase and other infrastructure errors, returns 503 Service Unavailable
 * with a structured response, and reports to ServiceHealthManager.
 */

import type { Request, Response, NextFunction } from 'express';
import { serviceHealthManager } from '../services/serviceHealth.js';
import { logger } from '../logger.js';

/** Node.js error codes for network/connection failures */
const INFRASTRUCTURE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
  'FETCH_ERROR',
]);

/** Substrings in error messages that indicate infrastructure/network issues */
const INFRASTRUCTURE_MESSAGE_PATTERNS = [
  'fetch',
  'network',
  'timeout',
  'timed out',
  'connection refused',
  'connection reset',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'Failed to fetch',
  'NetworkError',
  'Load failed',
  'supabase',
  'postgres',
  'PGRST',
];

/**
 * Determines if an error is likely caused by Supabase/infrastructure unavailability
 * rather than application logic.
 */
export function isSupabaseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const e = err as NodeJS.ErrnoException & { code?: string; message?: string };
  const msg = (e.message || String(err)).toLowerCase();

  if (e.code && INFRASTRUCTURE_ERROR_CODES.has(e.code)) {
    return true;
  }

  for (const pattern of INFRASTRUCTURE_MESSAGE_PATTERNS) {
    if (msg.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // Supabase PostgrestError and similar
  if (e.name === 'FetchError' || e.name === 'PostgrestError') {
    return true;
  }

  return false;
}

/**
 * Sends 503 Service Unavailable response with structured body.
 * Use in catch blocks when isSupabaseError returns true.
 */
export function sendServiceUnavailable(res: Response, service: string, errorMessage: string): void {
  res.status(503).json({
    error: errorMessage,
    code: 'SERVICE_UNAVAILABLE',
    service,
  });
}

/**
 * Handles a caught error in route handlers. If the error is infrastructure-related,
 * reports to ServiceHealthManager, sends 503, and returns true.
 * Otherwise returns false so the caller can handle with generic 500.
 */
export function handleServiceError(
  err: unknown,
  req: Request,
  res: Response,
  service: string = 'supabase'
): boolean {
  if (!isSupabaseError(err)) return false;

  const errorMessage = err instanceof Error ? err.message : String(err);
  serviceHealthManager.reportError(service, errorMessage);
  req.log?.warn({ err, service }, 'Service unavailable');
  sendServiceUnavailable(res, service, errorMessage);
  return true;
}

/**
 * Express error-handling middleware. Catches errors passed via next(err).
 * When the error is infrastructure-related, returns 503 instead of 500.
 */
export function serviceUnavailableErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  if (isSupabaseError(err)) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    serviceHealthManager.reportError('supabase', errorMessage);
    req.log?.warn({ err }, 'Service unavailable (Supabase)');
    res.status(503).json({
      error: errorMessage,
      code: 'SERVICE_UNAVAILABLE',
      service: 'supabase',
    });
    return;
  }

  // Pass to default Express error handler or next error handler
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
}
