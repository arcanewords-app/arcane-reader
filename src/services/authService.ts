import { supabase } from './supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRole } from '../types/roles.js';

const DEFAULT_ROLE = 'user' as const;

interface ProfileData {
  role: AuthUser['role'];
  avatar_url: string | null;
}

async function getProfile(client: SupabaseClient, userId: string): Promise<ProfileData> {
  const { data } = await client
    .from('profiles')
    .select('role, avatar_url')
    .eq('id', userId)
    .single();
  const role = parseRole(data?.role);
  return {
    role: role === 'guest' ? DEFAULT_ROLE : role,
    avatar_url: data?.avatar_url ?? null,
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'author' | 'author_plus' | 'super_author' | 'admin';
  avatarUrl?: string | null;
}

export const authService = {
  /**
   * Register new user
   */
  async register(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('Registration failed: No user data returned');
    }

    // Profile will be created automatically by trigger handle_new_user() with role = 'user'
    return {
      id: data.user.id,
      email: data.user.email!,
      role: 'user',
      avatarUrl: null,
    };
  },

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(`Login failed: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('Login failed: No user data returned');
    }

    const profile = await getProfile(supabase, data.user.id);
    return {
      id: data.user.id,
      email: data.user.email!,
      role: profile.role,
      avatarUrl: profile.avatar_url,
    };
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(`Logout failed: ${error.message}`);
    }
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const profile = await getProfile(supabase, user.id);
    return {
      id: user.id,
      email: user.email!,
      role: profile.role,
      avatarUrl: profile.avatar_url,
    };
  },

  /**
   * Get user by JWT token (for server-side auth verification)
   */
  async getUserByToken(token: string): Promise<AuthUser | null> {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error,
    } = await supabaseWithToken.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const { data: profile } = await supabaseWithToken
      .from('profiles')
      .select('role, avatar_url')
      .eq('id', user.id)
      .single();

    const role = parseRole(profile?.role);

    return {
      id: user.id,
      email: user.email!,
      role: role === 'guest' ? 'user' : role,
      avatarUrl: profile?.avatar_url ?? null,
    };
  },

  /**
   * Get session (for server-side auth)
   */
  async getSession() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      throw new Error(`Get session failed: ${error.message}`);
    }
    return session;
  },

  /**
   * Refresh session using refresh token. Returns new access/refresh token pair.
   * Uses a dedicated client to avoid affecting the main supabase instance.
   */
  async refreshSession(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
  } | null> {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    const refreshClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const {
      data: { session },
      error,
    } = await refreshClient.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !session) {
      return null;
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? 0,
    };
  },
};
