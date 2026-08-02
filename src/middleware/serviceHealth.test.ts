import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';

const { reportError, getSupabaseStatus } = vi.hoisted(() => ({
  reportError: vi.fn(),
  getSupabaseStatus: vi.fn(() => 'healthy' as 'healthy' | 'down' | 'degraded'),
}));

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
}));

vi.mock('../services/serviceHealth.js', () => ({
  serviceHealthManager: {
    reportError: (...args: unknown[]) => reportError(...args),
    getSupabaseStatus: (...args: unknown[]) => getSupabaseStatus(...args),
  },
}));

vi.mock('../services/redisCache.js', () => ({
  hasRedisCache: vi.fn(() => false),
  buildRedisKey: (...parts: Array<string | number | boolean>) => parts.join(':'),
  redisGetJson: vi.fn(async () => null),
  redisSetJson: vi.fn(async () => undefined),
  redisDelMany: vi.fn(async () => undefined),
  redisDelByPattern: vi.fn(async () => 0),
}));

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  isHealthExemptPath,
  isPublicReadRoute,
  resolveSupabaseStatusForBreaker,
} from '../services/healthCircuitBreaker.js';
import { shouldAwaitRecoveryProbe } from '../services/healthSnapshotStore.js';
import type { HealthCheckResult } from '../services/serviceHealth.js';
import {
  handleServiceError,
  isSupabaseError,
  requireHealthySupabase,
  sendServiceUnavailable,
  serviceUnavailableErrorHandler,
} from './serviceHealth.js';
import type { NextFunction, Request, Response } from 'express';

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

  it('returns false for nullish and non-objects', () => {
    assert.equal(isSupabaseError(null), false);
    assert.equal(isSupabaseError(undefined), false);
    assert.equal(isSupabaseError('string'), false);
  });

  it('detects FetchError by name', () => {
    assert.equal(isSupabaseError({ name: 'FetchError', message: 'boom' }), true);
  });
});

describe('sendServiceUnavailable', () => {
  it('writes structured 503 body', () => {
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

    sendServiceUnavailable(res, 'redis', 'upstash timeout');
    assert.equal(statusCode, 503);
    assert.deepEqual(body, {
      error: 'upstash timeout',
      code: 'SERVICE_UNAVAILABLE',
      service: 'redis',
    });
  });
});

describe('handleServiceError', () => {
  it('sends 503 for infrastructure errors', () => {
    reportError.mockClear();
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
      { log: { warn: vi.fn() } } as unknown as Request,
      res
    );
    assert.equal(handled, true);
    assert.equal(statusCode, 503);
    assert.equal((body as { code: string }).code, 'SERVICE_UNAVAILABLE');
    assert.equal(reportError.mock.calls.length, 1);
  });

  it('returns false for application errors', () => {
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;
    assert.equal(handleServiceError(new Error('bad input'), {} as Request, res), false);
  });
});

describe('requireHealthySupabase', () => {
  it('bypasses breaker for exempt and public read routes', async () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;

    await requireHealthySupabase({ path: '/status', method: 'GET' } as Request, res, next);
    await requireHealthySupabase({ path: '/publications', method: 'GET' } as Request, res, next);
    assert.equal((next as unknown as ReturnType<typeof vi.fn>).mock.calls.length, 2);
  });

  it('returns 503 when supabase is down on private routes', async () => {
    getSupabaseStatus.mockReturnValueOnce('down');
    let statusCode = 200;
    let body: unknown;
    const next = vi.fn() as unknown as NextFunction;
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

    await requireHealthySupabase({ path: '/projects', method: 'GET' } as Request, res, next);

    assert.equal(statusCode, 503);
    assert.equal((body as { service: string }).service, 'supabase');
    assert.equal((next as unknown as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  });
});

describe('serviceUnavailableErrorHandler', () => {
  it('returns 503 for redis infrastructure errors', () => {
    let statusCode = 200;
    let body: unknown;
    const res = {
      headersSent: false,
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;
    const next = vi.fn() as unknown as NextFunction;

    serviceUnavailableErrorHandler(
      new Error('upstash redis timeout'),
      { path: '/api/projects', log: { warn: vi.fn() } } as unknown as Request,
      res,
      next
    );

    assert.equal(statusCode, 503);
    assert.equal((body as { service: string }).service, 'redis');
    assert.equal((next as unknown as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  });

  it('returns 500 for non-infrastructure errors', () => {
    let statusCode = 200;
    let body: unknown;
    const res = {
      headersSent: false,
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;
    const next = vi.fn() as unknown as NextFunction;

    serviceUnavailableErrorHandler(
      new Error('logic bug'),
      { path: '/api/projects' } as Request,
      res,
      next
    );

    assert.equal(statusCode, 500);
    assert.equal((body as { error: string }).error, 'logic bug');
  });

  it('delegates when headers already sent', () => {
    const err = new Error('late');
    const next = vi.fn() as unknown as NextFunction;
    serviceUnavailableErrorHandler(
      err,
      { path: '/api/x' } as Request,
      { headersSent: true } as Response,
      next
    );
    assert.equal((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], err);
  });
});
