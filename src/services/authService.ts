import { supabase } from './supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRole } from '../types/roles.js';

const DEFAULT_ROLE = 'author' as const;

async function getProfileRole(client: SupabaseClient, userId: string): Promise<AuthUser['role']> {
  const { data } = await client.from('profiles').select('role').eq('id', userId).single();
  const role = parseRole(data?.role);
  return role === 'guest' ? DEFAULT_ROLE : role;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'author' | 'author_plus' | 'super_author' | 'admin';
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

    // Profile will be created automatically by trigger handle_new_user() with role = 'author'
    return {
      id: data.user.id,
      email: data.user.email!,
      role: 'author',
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

    const role = await getProfileRole(supabase, data.user.id);
    return {
      id: data.user.id,
      email: data.user.email!,
      role,
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
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const role = await getProfileRole(supabase, user.id);
    return {
      id: user.id,
      email: user.email!,
      role,
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

    const { data: { user }, error } = await supabaseWithToken.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const { data: profile } = await supabaseWithToken
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = parseRole(profile?.role);

    return {
      id: user.id,
      email: user.email!,
      role: role === 'guest' ? 'author' : role,
    };
  },

  /**
   * Get session (for server-side auth)
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(`Get session failed: ${error.message}`);
    }
    return session;
  },
};
