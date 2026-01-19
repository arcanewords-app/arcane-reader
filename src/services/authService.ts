import { supabase } from './supabaseClient.js';
import { createClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
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

    // Profile will be created automatically by trigger handle_new_user()
    return {
      id: data.user.id,
      email: data.user.email!,
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

    return {
      id: data.user.id,
      email: data.user.email!,
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

    return {
      id: user.id,
      email: user.email!,
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

    return {
      id: user.id,
      email: user.email!,
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
