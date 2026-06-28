/**
 * Route boundary validation — Express 4/5 compatible params and query parsing.
 */

import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type { z } from 'zod';
import { requireRouteParam, routeParam, queryParam } from '../shared/expressRouteParams.js';

export { requireRouteParam, routeParam, queryParam };

/** Coerce query values that may be string | string[] (Express 5 types) to plain strings. */
export function normalizeQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Flatten req.query for Zod safeParse — repeated keys become first value. */
export function normalizeQueryRecord(
  query: Record<string, unknown>
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = normalizeQueryValue(value);
  }
  return out;
}

export function sendZodValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    details: error.flatten().fieldErrors,
  });
}

/**
 * Validate route params with Zod; sets req.validatedParams on success.
 */
export function validateParams<T extends z.ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const normalized: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.params)) {
      normalized[key] = routeParam(value as string | string[] | undefined);
    }
    const result = schema.safeParse(normalized);
    if (!result.success) {
      sendZodValidationError(res, result.error);
      return;
    }
    req.validatedParams = result.data as z.infer<T>;
    next();
  };
}

/**
 * Validate query string with Zod; sets req.validatedQuery on success.
 */
export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(normalizeQueryRecord(req.query as Record<string, unknown>));
    if (!result.success) {
      sendZodValidationError(res, result.error);
      return;
    }
    req.validatedQuery = result.data as z.infer<T>;
    next();
  };
}

/** Inline parse for handlers not using middleware — returns data or sends 400. */
export function parseQuery<T extends z.ZodType>(
  schema: T,
  req: Request,
  res: Response
): z.infer<T> | null {
  const result = schema.safeParse(normalizeQueryRecord(req.query as Record<string, unknown>));
  if (!result.success) {
    sendZodValidationError(res, result.error);
    return null;
  }
  return result.data;
}

/** Inline parse for route params. */
export function parseParams<T extends z.ZodType>(
  schema: T,
  req: Request,
  res: Response
): z.infer<T> | null {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.params)) {
    normalized[key] = routeParam(value as string | string[] | undefined);
  }
  const result = schema.safeParse(normalized);
  if (!result.success) {
    sendZodValidationError(res, result.error);
    return null;
  }
  return result.data;
}
