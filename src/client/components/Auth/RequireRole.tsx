/**
 * Renders children only if the user has at least the required role.
 * Otherwise renders fallback (or null).
 */

import type { ComponentChildren } from 'preact';
import { useUserRole } from '../../hooks/useUserRole';
import type { UserRole } from '../../types';

export interface RequireRoleProps {
  /** Minimum role required to see children. */
  minRole: UserRole;
  /** Rendered when user is not authenticated or role is insufficient. */
  fallback?: ComponentChildren;
  children: ComponentChildren;
}

export function RequireRole({ minRole, fallback = null, children }: RequireRoleProps) {
  const { user, isAtLeast } = useUserRole();

  if (!user || !isAtLeast(minRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
