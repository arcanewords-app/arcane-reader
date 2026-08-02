/**
 * Auth middleware stub for mock-integration tests.
 * Reads Bearer token and sets req.user; role from X-Test-Role or defaultRole.
 * Does not call Supabase Auth.
 */

import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';
import { isAtLeastRole, type UserRole } from '../../../src/types/roles.js';

export type TestAuthRole = Extract<UserRole, 'user' | 'author' | 'author_plus' | 'admin'>;

export type InstallAuthMocksOptions = {
  defaultRole?: TestAuthRole;
  defaultUserId?: string;
  defaultEmail?: string;
};

function parseRoleHeader(req: Request, fallback: TestAuthRole): TestAuthRole {
  const raw = req.headers['x-test-role'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'user' || value === 'author' || value === 'author_plus' || value === 'admin') {
    return value;
  }
  return fallback;
}

function attachUser(req: Request, options: Required<InstallAuthMocksOptions>, token: string): void {
  const role = parseRoleHeader(req, options.defaultRole);
  req.user = {
    id: options.defaultUserId,
    email: options.defaultEmail,
    role,
    avatarUrl: null,
  };
  req.token = token;
}

/**
 * Factory for `vi.mock('.../middleware/auth.js', () => installAuthMocks())`.
 */
export function installAuthMocks(options: InstallAuthMocksOptions = {}) {
  const resolved: Required<InstallAuthMocksOptions> = {
    defaultRole: options.defaultRole ?? 'author',
    defaultUserId: options.defaultUserId ?? 'test-user-id',
    defaultEmail: options.defaultEmail ?? 'test@example.com',
  };

  const requireAuth = vi.fn(async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }
    attachUser(req, resolved, authHeader.substring(7));
    next();
  });

  const optionalAuth = vi.fn(async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      next();
      return;
    }
    attachUser(req, resolved, authHeader.substring(7));
    next();
  });

  const requireRole = vi.fn((minRole: UserRole) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized: No token provided' });
        return;
      }
      if (!isAtLeastRole(req.user.role, minRole)) {
        res.status(403).json({ error: 'Forbidden: insufficient role' });
        return;
      }
      next();
    };
  });

  const invalidateProfileCache = vi.fn((_userId: string) => {});

  return {
    requireAuth,
    optionalAuth,
    requireRole,
    invalidateProfileCache,
  };
}
