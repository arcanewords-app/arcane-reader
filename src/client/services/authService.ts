/**
 * Arcane Reader - Auth Service
 * Client-side authentication service for managing JWT tokens and user sessions
 */

import type { AuthUser, LoginResponse, RegisterResponse, Session } from '../types';

const TOKEN_KEY = 'arcane_auth_token';
const REFRESH_KEY = 'arcane_auth_refresh';
const USER_KEY = 'arcane_user';
const EXPIRES_KEY = 'arcane_auth_expires';

/** Refresh access token this many seconds before expiry (Supabase default JWT TTL: 3600s). */
const REFRESH_THRESHOLD_SEC = 300;
const SESSION_KEEPER_INTERVAL_MS = 60_000;

export const AUTH_CHANGED_EVENT = 'arcane:auth-changed';
export const USER_UPDATED_EVENT = 'arcane:user-updated';
export const OPEN_AUTH_EVENT = 'arcane:open-auth';
export const POST_AUTH_REDIRECT_KEY = 'arcane:postAuthRedirect';

export type AuthChangedDetail = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type OpenAuthDetail = {
  mode?: 'login' | 'register';
  redirect?: string;
};

export type RefreshOptions = {
  /** Skip AUTH_CHANGED when only renewing tokens (same user). */
  silent?: boolean;
};

let sessionKeeperInterval: ReturnType<typeof setInterval> | null = null;
let sessionKeeperVisibilityHandler: (() => void) | null = null;
let ensureFreshSessionPromise: Promise<boolean> | null = null;

export function isReadingRoute(path: string): boolean {
  return /^\/p\/[^/]+\/chapters\/[^/]+\/reading\/?$/.test(path) || /\/reading\/?$/.test(path);
}

export function openAuthModal(detail?: OpenAuthDetail): void {
  if (detail?.redirect) {
    sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, detail.redirect);
  }
  window.dispatchEvent(new CustomEvent<OpenAuthDetail>(OPEN_AUTH_EVENT, { detail }));
}

export function consumePostAuthRedirect(): string | null {
  const redirect = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
  if (redirect) {
    sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
  }
  return redirect;
}

// Helper function to clear storage
function clearAuthStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

function dispatchAuthChanged(user: AuthUser | null): void {
  window.dispatchEvent(
    new CustomEvent<AuthChangedDetail>(AUTH_CHANGED_EVENT, {
      detail: {
        authenticated: !!user,
        user,
      },
    })
  );
}

export const authService = {
  /**
   * Register new user
   */
  async register(email: string, password: string): Promise<AuthUser> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Registration failed');
    }

    const { user }: RegisterResponse = await response.json();
    return user;
  },

  /**
   * Login user
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: AuthUser; session: Session | null }> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }

    const data: LoginResponse = await response.json();

    // Save token and user
    if (data.session) {
      localStorage.setItem(TOKEN_KEY, data.session.access_token);
      localStorage.setItem(REFRESH_KEY, data.session.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      if (data.session.expires_at) {
        localStorage.setItem(EXPIRES_KEY, String(data.session.expires_at));
      }
    }
    dispatchAuthChanged(data.session ? data.user : null);

    return data;
  },

  /**
   * Refresh session using refresh_token. Returns true if successful.
   * Uses raw fetch to avoid circular 401 handling in API client.
   */
  async refresh(options?: RefreshOptions): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as { session?: Session };
      if (!data.session) return false;

      localStorage.setItem(TOKEN_KEY, data.session.access_token);
      localStorage.setItem(REFRESH_KEY, data.session.refresh_token);
      if (data.session.expires_at) {
        localStorage.setItem(EXPIRES_KEY, String(data.session.expires_at));
      }
      if (!options?.silent) {
        dispatchAuthChanged(this.getCachedUser());
      }
      return true;
    } catch {
      return false;
    }
  },

  getExpiresAt(): number | null {
    const raw = localStorage.getItem(EXPIRES_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },

  shouldRefreshSoon(thresholdSec = REFRESH_THRESHOLD_SEC): boolean {
    const expiresAt = this.getExpiresAt();
    if (!expiresAt) return false;
    const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
    return secondsLeft < thresholdSec;
  },

  async ensureFreshSession(): Promise<boolean> {
    if (!this.isAuthenticated()) return false;
    if (!this.shouldRefreshSoon()) return true;

    if (ensureFreshSessionPromise) return ensureFreshSessionPromise;

    ensureFreshSessionPromise = this.refresh({ silent: true }).finally(() => {
      ensureFreshSessionPromise = null;
    });
    return ensureFreshSessionPromise;
  },

  startSessionKeeper(): void {
    if (typeof window === 'undefined') return;
    this.stopSessionKeeper();

    const tick = () => {
      if (document.visibilityState === 'visible' && this.isAuthenticated()) {
        void this.ensureFreshSession();
      }
    };

    sessionKeeperInterval = setInterval(tick, SESSION_KEEPER_INTERVAL_MS);

    sessionKeeperVisibilityHandler = () => {
      if (!document.hidden) {
        void this.ensureFreshSession();
      }
    };
    document.addEventListener('visibilitychange', sessionKeeperVisibilityHandler);

    void this.ensureFreshSession();
  },

  stopSessionKeeper(): void {
    if (sessionKeeperInterval) {
      clearInterval(sessionKeeperInterval);
      sessionKeeperInterval = null;
    }
    if (sessionKeeperVisibilityHandler) {
      document.removeEventListener('visibilitychange', sessionKeeperVisibilityHandler);
      sessionKeeperVisibilityHandler = null;
    }
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    this.stopSessionKeeper();

    // Clear local storage first
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    dispatchAuthChanged(null);

    // Call API logout endpoint
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Ignore API errors - we've already cleared local storage
      console.warn('Logout API call failed:', error);
    }
  },

  /**
   * Get cached user from localStorage (synchronous). Use getCurrentUser() for fresh data.
   */
  getCachedUser(): AuthUser | null {
    const userJson = localStorage.getItem(USER_KEY);
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    // First check local storage cache
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        // Invalid JSON, clear it
        localStorage.removeItem(USER_KEY);
      }
    }

    // If no cache, try to get user from API (validates token)
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return null;
    }

    try {
      let response = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // On 401, try refresh and retry once (silent — same user, no UI remount)
      if (response.status === 401 && (await this.refresh({ silent: true }))) {
        const newToken = localStorage.getItem(TOKEN_KEY);
        if (newToken) {
          response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${newToken}` },
          });
        }
      }

      if (!response.ok) {
        // Token invalid, clear storage
        this.clearStorage();
        return null;
      }

      const { user } = await response.json();
      // Update cache
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (error) {
      console.warn('Failed to get current user:', error);
      return null;
    }
  },

  /**
   * Get JWT token from storage
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Check if user is authenticated (has valid token)
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Clear all auth storage
   */
  clearStorage(): void {
    clearAuthStorage();
    dispatchAuthChanged(null);
  },

  /**
   * Update cached user (e.g. after avatar upload). Merges updates and saves to localStorage.
   * Dispatches 'arcane:user-updated' so UI can refresh.
   */
  updateUserCache(updates: Partial<AuthUser>): void {
    const current = this.getCachedUser();
    if (!current) return;
    const updated = { ...current, ...updates };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT, { detail: updated }));
    dispatchAuthChanged(updated);
  },
};
