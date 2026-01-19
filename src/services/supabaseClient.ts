import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create a Supabase client with user token for RLS authentication
export function createClientWithToken(token: string) {
  // Validate token format
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Invalid token: token must be a non-empty string');
  }

  // Basic JWT format validation (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token: token must be a valid JWT format (header.payload.signature)');
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

// Server-side client with service role (bypasses RLS, use carefully)
export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  }
  return createClient(supabaseUrl!, serviceRoleKey);
}
