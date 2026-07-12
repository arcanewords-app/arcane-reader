import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
}));

import {
  isHealthExemptPath,
  isPublicReadRoute,
  resolveSupabaseStatusForBreaker,
} from '../services/healthCircuitBreaker.js';
import { shouldAwaitRecoveryProbe } from '../services/healthSnapshotStore.js';
import type { HealthCheckResult } from '../services/serviceHealth.js';
import { handleServiceError, isSupabaseError } from './serviceHealth.js';
import type { Request, Response } from 'express';

describe('isHealthExemptPath', () => {
  it('exempts status and health', () => {
    assert.equal(isHealthExemptPath('/status'), true);
    assert.equal(isHealthExemptPath('/health'), true);
    assert.equal(isHealthExemptPath('/publications'), false);
  });
});

describe('isPublicReadRoute', () => {
  it('allows public GET catalog and news', () => {
    assert.equal(isPublicReadRoute('GET', '/publications'), true);
    assert.equal(isPublicReadRoute('GET', '/publications/abc/chapters'), true);
    assert.equal(isPublicReadRoute('GET', '/news'), true);
    assert.equal(isPublicReadRoute('GET', '/news/slug'), true);
    assert.equal(isPublicReadRoute('GET', '/announcements/active'), true);
    assert.equal(isPublicReadRoute('GET', '/public/entities'), true);
    assert.equal(isPublicReadRoute('GET', '/public/entities/id'), true);
  });

  it('blocks mutations and private routes', () => {
    assert.equal(isPublicReadRoute('POST', '/announcements/id/dismiss'), false);
    assert.equal(isPublicReadRoute('GET', '/projects'), false);
    assert.equal(isPublicReadRoute('GET', '/user/reading-history'), false);
  });
});

describe('shouldAwaitRecoveryProbe', () => {
  it('awaits probe when stale and supabase down', () => {
    assert.equal(shouldAwaitRecoveryProbe(true, 'down'), true);
  });

  it('skips await when fresh or not down', () => {
    assert.equal(shouldAwaitRecoveryProbe(false, 'down'), false);
    assert.equal(shouldAwaitRecoveryProbe(true, 'healthy'), false);
    assert.equal(shouldAwaitRecoveryProbe(true, 'degraded'), false);
  });
});

describe('resolveSupabaseStatusForBreaker', () => {
  it('prefers Redis shared supabase status (redis down does not trip breaker)', async () => {
    const shared: HealthCheckResult = {
      status: 'down',
      timestamp: new Date().toISOString(),
      services: {
        supabase: { status: 'healthy', lastCheck: new Date(), lastHealthy: new Date() },
        redis: { status: 'down', lastCheck: new Date(), lastHealthy: null, error: 'timeout' },
      },
    };

    const status = await resolveSupabaseStatusForBreaker(
      () => 'down',
      async () => shared
    );
    assert.equal(status, 'healthy');
  });

  it('falls back to local getter when Redis empty', async () => {
    const status = await resolveSupabaseStatusForBreaker(
      () => 'degraded',
      async () => null
    );
    assert.equal(status, 'degraded');
  });
});

describe('isSupabaseError', () => {
  it('detects infrastructure error codes', () => {
    assert.equal(isSupabaseError({ code: 'ECONNREFUSED', message: 'connect' }), true);
    assert.equal(isSupabaseError({ message: 'fetch failed to supabase' }), true);
    assert.equal(isSupabaseError({ name: 'PostgrestError', message: 'db' }), true);
    assert.equal(isSupabaseError(new Error('validation failed')), false);
  });
});

describe('handleServiceError', () => {
  it('sends 503 for infrastructure errors', () => {
    let statusCode = 200;
    let body: unknown;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;
    const handled = handleServiceError(
      { code: 'ETIMEDOUT', message: 'timeout' },
      {} as Request,
      res
    );
    assert.equal(handled, true);
    assert.equal(statusCode, 503);
    assert.equal((body as { code: string }).code, 'SERVICE_UNAVAILABLE');
  });
});
