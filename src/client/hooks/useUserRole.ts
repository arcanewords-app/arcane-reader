/**
 * Hook for role-based checks in UI.
 * Uses cached user and optionally refreshes from API on mount.
 */

import { useState, useEffect } from 'preact/hooks';
import type { AuthUser, UserRole } from '../types';
import { authService } from '../services/authService';

const ROLE_ORDER: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  author: 2,
  author_plus: 3,
  super_author: 4,
  admin: 5,
};

function isAtLeastRole(current: UserRole, required: UserRole): boolean {
  return ROLE_ORDER[current] >= ROLE_ORDER[required];
}

export function useUserRole() {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCachedUser());

  useEffect(() => {
    authService.getCurrentUser().then(setUser);
    const onUserUpdated = (e: CustomEvent<AuthUser>) => {
      setUser(e.detail);
    };
    window.addEventListener('arcane:user-updated', onUserUpdated as EventListener);
    return () => window.removeEventListener('arcane:user-updated', onUserUpdated as EventListener);
  }, []);

  const role: UserRole = user ? (user.role ?? 'user') : 'guest';
  const isGuest = !user;

  return {
    user,
    role,
    isGuest,
    isAtLeast: (required: UserRole) => isAtLeastRole(role, required),
    refresh: () => authService.getCurrentUser().then(setUser),
  };
}
