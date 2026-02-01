/**
 * User roles and role hierarchy.
 * Used on both server (middleware, req.user) and client (AuthUser, UI).
 */

export type UserRole = 'guest' | 'author' | 'author_plus' | 'super_author' | 'admin';

export const ROLES: UserRole[] = ['guest', 'author', 'author_plus', 'super_author', 'admin'];

/** Default role for authenticated users when profile has no role set. */
export const DEFAULT_AUTHENTICATED_ROLE: UserRole = 'author';

/** Role hierarchy order (lower index = lower privilege). */
const ROLE_ORDER: Record<UserRole, number> = {
  guest: 0,
  author: 1,
  author_plus: 2,
  super_author: 3,
  admin: 4,
};

/**
 * Check if current role has at least the required privilege level.
 * Guest is always the lowest; admin is the highest.
 */
export function isAtLeastRole(current: UserRole, required: UserRole): boolean {
  return ROLE_ORDER[current] >= ROLE_ORDER[required];
}

/**
 * Parse role from DB string; returns default for invalid or unknown values.
 */
export function parseRole(value: unknown): UserRole {
  if (typeof value !== 'string') return DEFAULT_AUTHENTICATED_ROLE;
  const r = value as UserRole;
  return ROLES.includes(r) ? r : DEFAULT_AUTHENTICATED_ROLE;
}
