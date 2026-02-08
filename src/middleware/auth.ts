import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { parseRole } from '../types/roles.js';
import { isAtLeastRole } from '../types/roles.js';
import type { UserRole } from '../types/roles.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const DEFAULT_ROLE = 'author' as const;

async function getProfileRoleFromToken(token: string, userId: string): Promise<UserRole> {
  const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await supabaseWithToken
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  const role = parseRole(data?.role);
  return role === 'guest' ? DEFAULT_ROLE : role;
}

/**
 * Express middleware to require authentication
 * Sets req.user with authenticated user data (id, email, role from profiles)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.substring(7);
    const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error,
    } = await supabaseWithToken.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const role = await getProfileRoleFromToken(token, user.id);

    req.user = {
      id: user.id,
      email: user.email!,
      role,
    };
    req.token = token;

    next();
  } catch (error) {
    const { logger } = await import('../logger.js');
    logger.error({ err: error }, 'Auth middleware error');
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Optional auth middleware - attaches user if token is valid, but doesn't fail if missing
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error,
    } = await supabaseWithToken.auth.getUser(token);

    if (user && !error) {
      const role = await getProfileRoleFromToken(token, user.id);
      req.user = {
        id: user.id,
        email: user.email!,
        role,
      };
      req.token = token;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

/**
 * Require at least the given role (must be used after requireAuth or ensure req.user is set).
 * Returns 403 if user role is lower than required.
 */
export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    if (!isAtLeastRole(req.user.role, minRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}
