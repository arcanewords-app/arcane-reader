/**
 * Per-role project count limits (translation workspace).
 */

import type { UserRole } from '../types/roles.js';

export const PROJECT_LIMITS = {
  UNLIMITED_LIMIT: -1 as const,
  ROLE_MAX_PROJECTS: {
    guest: 0,
    user: 0,
    author: 10,
    author_plus: 30,
    super_author: 100,
    admin: -1,
  } as const satisfies Record<UserRole, number>,
} as const;

export function getProjectLimitForRole(role: UserRole): number {
  return PROJECT_LIMITS.ROLE_MAX_PROJECTS[role];
}

export function isUnlimitedProjectLimit(limit: number): boolean {
  return limit === PROJECT_LIMITS.UNLIMITED_LIMIT || limit < 0;
}

export interface ProjectLimitErrorPayload {
  code: 'PROJECT_LIMIT';
  limit: number;
  current: number;
}

export function createProjectLimitError(
  limit: number,
  current: number
): Error & ProjectLimitErrorPayload {
  const err = new Error('Project limit reached') as Error & ProjectLimitErrorPayload;
  err.code = 'PROJECT_LIMIT';
  err.limit = limit;
  err.current = current;
  return err;
}

export function isProjectLimitError(error: unknown): error is Error & ProjectLimitErrorPayload {
  if (!(error instanceof Error)) return false;
  const e = error as Error & Partial<ProjectLimitErrorPayload>;
  return e.code === 'PROJECT_LIMIT' && typeof e.limit === 'number' && typeof e.current === 'number';
}
