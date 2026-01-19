/**
 * Request helpers for Express with authentication
 */

import type { Request } from 'express';

/**
 * Get token from request, throwing error if not available
 * Use this after requireAuth middleware to ensure token is present
 */
export function requireToken(req: Request): string {
  if (!req.token) {
    throw new Error('Token is required but not provided in request');
  }
  return req.token;
}
