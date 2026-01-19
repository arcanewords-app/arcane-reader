/**
 * Arcane Reader - Auth Service
 * Client-side authentication service for managing JWT tokens and user sessions
 */

import type { AuthUser, LoginResponse, RegisterResponse, Session } from '../types';

const TOKEN_KEY = 'arcane_auth_token';
const REFRESH_KEY = 'arcane_auth_refresh';
const USER_KEY = 'arcane_user';

// Helper function to clear storage
function clearAuthStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
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
  async login(email: string, password: string): Promise<{ user: AuthUser; session: Session | null }> {
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
    }

    return data;
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    // Clear local storage first
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);

    // Call API logout endpoint
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Ignore API errors - we've already cleared local storage
      console.warn('Logout API call failed:', error);
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
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Token invalid, clear storage
        clearAuthStorage();
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
  },
};
