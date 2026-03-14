/**
 * Hook for role-based checks in UI.
 * Uses cached user and optionally refreshes from API on mount.
 */

import { useState, useEffect } from 'preact/hooks';
import type { AuthUser, UserRole } from '../types';
import {
  AUTH_CHANGED_EVENT,
  USER_UPDATED_EVENT,
  authService,
  type AuthChangedDetail,
} from '../services/authService';

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
    const onAuthChanged = (e: CustomEvent<AuthChangedDetail>) => {
      setUser(e.detail.user);
    };
    window.addEventListener(USER_UPDATED_EVENT, onUserUpdated as EventListener);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged as EventListener);
    return () => {
      window.removeEventListener(USER_UPDATED_EVENT, onUserUpdated as EventListener);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged as EventListener);
    };
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
