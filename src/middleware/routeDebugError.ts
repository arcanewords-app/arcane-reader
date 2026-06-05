/**
 * Attach structured route error context for debug logging and HTTP capture (dev).
 */

import type { Request, Response } from 'express';
import { AuthServiceError } from '../services/authErrors.js';
import { handleServiceError } from './serviceHealth.js';

export interface RouteDebugError {
  event: string;
  clientMessage: string;
  operation?: string;
  upstreamCode?: string;
  upstreamStatus?: number;
  upstreamMessage?: string;
}

type ResponseWithDebugError = Response & { locals: { routeDebugError?: RouteDebugError } };

export function setRouteDebugError(res: Response, error: RouteDebugError): void {
  (res as ResponseWithDebugError).locals.routeDebugError = error;
}

export function getRouteDebugError(res: Response): RouteDebugError | undefined {
  return (res as ResponseWithDebugError).locals.routeDebugError;
}

export function buildRouteDebugError(
  event: string,
  error: unknown,
  fallbackMessage: string
): RouteDebugError {
  const clientMessage = error instanceof Error ? error.message : fallbackMessage;
  const base: RouteDebugError = { event, clientMessage };

  if (error instanceof AuthServiceError) {
    return {
      ...base,
      operation: error.operation,
      upstreamCode: error.upstreamCode,
      upstreamStatus: error.upstreamStatus,
      upstreamMessage: error.upstreamMessage,
    };
  }

  return base;
}

/**
 * Handle infrastructure errors (503) or respond with a client error and debug context.
 * Returns true when a response was sent.
 */
export function respondRouteError(
  req: Request,
  res: Response,
  error: unknown,
  params: { event: string; fallbackMessage: string; statusCode: number }
): boolean {
  if (handleServiceError(error, req, res)) return true;

  setRouteDebugError(res, buildRouteDebugError(params.event, error, params.fallbackMessage));
  const message = error instanceof Error ? error.message : params.fallbackMessage;
  res.status(params.statusCode).json({ error: message });
  return true;
}
