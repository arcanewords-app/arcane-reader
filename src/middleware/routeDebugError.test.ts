import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { afterEach, describe, it, vi } from 'vitest';
import { AuthServiceError } from '../services/authErrors.js';

const { mockHandleServiceError } = vi.hoisted(() => ({
  mockHandleServiceError: vi.fn(),
}));

vi.mock('./serviceHealth.js', () => ({
  handleServiceError: mockHandleServiceError,
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

import {
  buildRouteDebugError,
  getRouteDebugError,
  respondRouteError,
  setRouteDebugError,
} from './routeDebugError.js';

function mockRes() {
  const res = {
    statusCode: 200,
    locals: {} as Record<string, unknown>,
    status: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
  };
  res.json.mockImplementation(() => res);
  return res as unknown as Response;
}

describe('buildRouteDebugError', () => {
  it('uses Error message as clientMessage', () => {
    const result = buildRouteDebugError('auth.login', new Error('bad credentials'), 'fallback');
    assert.equal(result.event, 'auth.login');
    assert.equal(result.clientMessage, 'bad credentials');
  });

  it('uses fallback when error is not Error instance', () => {
    const result = buildRouteDebugError('auth.login', 'oops', 'fallback message');
    assert.equal(result.clientMessage, 'fallback message');
  });

  it('includes upstream metadata for AuthServiceError', () => {
    const err = new AuthServiceError('login', 'Invalid login', {
      code: 'invalid_credentials',
      upstreamStatus: 400,
    });
    const result = buildRouteDebugError('auth.login', err, 'fallback');
    assert.equal(result.operation, 'login');
    assert.equal(result.upstreamCode, 'invalid_credentials');
    assert.equal(result.upstreamStatus, 400);
    assert.equal(result.upstreamMessage, 'Invalid login');
  });
});

describe('setRouteDebugError / getRouteDebugError', () => {
  it('stores and retrieves debug error on response locals', () => {
    const res = mockRes();
    const debugError = { event: 'project.update', clientMessage: 'Validation failed' };
    setRouteDebugError(res, debugError);
    assert.deepEqual(getRouteDebugError(res), debugError);
  });
});

describe('respondRouteError', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns true when handleServiceError handles infrastructure error', () => {
    mockHandleServiceError.mockReturnValue(true);
    const req = {} as Request;
    const res = mockRes();

    const handled = respondRouteError(req, res, new Error('supabase down'), {
      event: 'project.load',
      fallbackMessage: 'Failed',
      statusCode: 500,
    });

    assert.equal(handled, true);
    assert.equal(mockHandleServiceError.mock.calls.length, 1);
    assert.equal((res.json as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  });

  it('responds with status and debug context for application errors', () => {
    mockHandleServiceError.mockReturnValue(false);
    const req = {} as Request;
    const res = mockRes();

    const handled = respondRouteError(req, res, new Error('not found'), {
      event: 'chapter.load',
      fallbackMessage: 'Chapter missing',
      statusCode: 404,
    });

    assert.equal(handled, true);
    assert.equal(res.statusCode, 404);
    assert.deepEqual((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], {
      error: 'not found',
    });
    assert.equal(getRouteDebugError(res)?.event, 'chapter.load');
  });
});
