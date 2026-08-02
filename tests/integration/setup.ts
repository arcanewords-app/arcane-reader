/**
 * Integration suite env isolation: strip developer Redis/Upstash env and
 * ensure Supabase client modules can load with dummy credentials.
 *
 * Imported by createTestApp / worker helpers — not registered as Vitest
 * setupFiles (setupFiles + some pools hit "failed to find the runner" on
 * Windows Vitest 4.0.8).
 *
 * Do not import vitest hooks here.
 */

const REDIS_ENV_KEYS = [
  'REDIS_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

export function stripRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) {
    delete process.env[key];
  }
}

export function ensureDummySupabaseEnv(): void {
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = 'integration-test-anon-key';
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'integration-test-service-role-key';
  }
}

stripRedisEnv();
ensureDummySupabaseEnv();
