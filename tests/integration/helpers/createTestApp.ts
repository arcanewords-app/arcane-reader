/**
 * createApp fixture for mock-integration tests.
 * Call only after vi.mock registrations in the test file.
 * One app instance per test file (module cache cleared between files when isolate is on).
 */

import type { Application } from 'express';
import { stripRedisEnv, ensureDummySupabaseEnv } from '../setup.js';

let cachedApp: Application | null = null;

/**
 * Load createApp after dotenv may have restored Redis env from .env,
 * then strip Redis again so job stores use Memory backends.
 * Always resets circuit-breaker supabase status to healthy.
 */
export async function getTestApp(): Promise<Application> {
  ensureDummySupabaseEnv();
  stripRedisEnv();

  if (!cachedApp) {
    const { createApp } = await import('../../../src/createApp.js');
    // createApp.ts imports dotenv/config — wipe Redis/Upstash again before stores init.
    stripRedisEnv();
    ensureDummySupabaseEnv();
    cachedApp = createApp().app;
  }

  const { markSupabaseHealthy } = await import('./health.js');
  markSupabaseHealthy();
  return cachedApp;
}

export function clearTestAppCache(): void {
  cachedApp = null;
}

/** beforeAll helper: ensure healthy breaker + cached app for this file. */
export async function bootTestApp(): Promise<Application> {
  clearTestAppCache();
  return getTestApp();
}
