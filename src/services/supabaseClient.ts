import { createClient } from '@supabase/supabase-js';

const SUPABASE_REQUEST_TIMEOUT_MS = parseInt(
  process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? '120000',
  10
);

/** Wraps fetch with a timeout to avoid hanging when Supabase is unresponsive. */
function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (init?.signal) {
      init.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };
}

const supabaseFetch = createFetchWithTimeout(SUPABASE_REQUEST_TIMEOUT_MS);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check SUPABASE_URL and SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: supabaseFetch },
});

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
      fetch: supabaseFetch,
    },
  });
}

// Server-side client with service role (bypasses RLS, use carefully)
export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  }
  return createClient(supabaseUrl!, serviceRoleKey, {
    global: { fetch: supabaseFetch },
  });
}
