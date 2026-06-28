import type { Logger } from 'pino';
import type { UserRole } from './roles.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        role: UserRole;
        avatarUrl: string | null;
      } | null;
      token?: string;
      log?: Logger;
      /** Set by validateParams() middleware */
      validatedParams?: unknown;
      /** Set by validateQuery() middleware */
      validatedQuery?: unknown;
    }
  }
}

export {};
