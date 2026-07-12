import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const {
  mockGetUser,
  mockProfileSingle,
  mockCreateClient,
  mockRedisGetJson,
  mockRedisSetJson,
  mockLoggerError,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockProfileSingle = vi.fn();
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockProfileSingle,
      })),
    })),
  }));
  const mockCreateClient = vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }));
  return {
    mockGetUser,
    mockProfileSingle,
    mockCreateClient,
    mockRedisGetJson: vi.fn(),
    mockRedisSetJson: vi.fn(),
    mockLoggerError: vi.fn(),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

vi.mock('../services/redisCache.js', () => ({
  buildRedisKey: (...parts: string[]) => parts.join(':'),
  redisGetJson: mockRedisGetJson,
  redisSetJson: mockRedisSetJson,
}));

vi.mock('../logger.js', () => ({
  logger: { error: mockLoggerError },
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

import { invalidateProfileCache, optionalAuth, requireAuth, requireRole } from './auth.js';

const VALID_TOKEN = 'header.payload.signature';

function mockRes() {
  const res = {
    statusCode: 200,
    status: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  res.json.mockImplementation(() => res);
  return res as unknown as Response;
}

function mockReq(headers: Record<string, string> = {}) {
  return {
    headers,
    user: undefined,
    token: undefined,
  } as unknown as Request;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateProfileCache('user-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(res.statusCode, 401);
    assert.deepEqual((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], {
      error: 'Unauthorized: No token provided',
    });
    assert.equal(next.mock.calls.length, 0);
  });

  it('returns 401 when Authorization is not Bearer', async () => {
    const req = mockReq({ authorization: 'Basic abc' });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(res.statusCode, 401);
    assert.match(
      (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.error as string,
      /Invalid token/
    );
  });

  it('attaches user and calls next when token and profile are valid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    });
    mockRedisGetJson.mockResolvedValue(null);
    mockProfileSingle.mockResolvedValue({
      data: { role: 'author', avatar_url: 'https://cdn/a.png' },
      error: null,
    });
    mockRedisSetJson.mockResolvedValue(undefined);

    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(next.mock.calls.length, 1);
    assert.equal(req.user?.id, 'user-1');
    assert.equal(req.user?.email, 'a@b.com');
    assert.equal(req.user?.role, 'author');
    assert.equal(req.user?.avatarUrl, 'https://cdn/a.png');
    assert.equal(req.token, VALID_TOKEN);
  });

  it('uses redis profile cache when available', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    });
    mockRedisGetJson.mockResolvedValue({ role: 'admin', avatarUrl: null });

    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(req.user?.role, 'admin');
    assert.equal(mockProfileSingle.mock.calls.length, 0);
    assert.equal(next.mock.calls.length, 1);
  });

  it('maps guest profile role to user default', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    });
    mockRedisGetJson.mockResolvedValue(null);
    mockProfileSingle.mockResolvedValue({
      data: { role: 'guest', avatar_url: null },
      error: null,
    });

    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(req.user?.role, 'user');
  });

  it('returns 401 when getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));
    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as NextFunction);

    assert.equal(res.statusCode, 401);
    assert.equal(mockLoggerError.mock.calls.length, 1);
    assert.equal(next.mock.calls.length, 0);
  });
});

describe('optionalAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets user null and continues when no Authorization header', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as NextFunction);

    assert.equal(req.user, null);
    assert.equal(next.mock.calls.length, 1);
  });

  it('sets user null when token invalid but continues', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as NextFunction);

    assert.equal(req.user, null);
    assert.equal(next.mock.calls.length, 1);
  });

  it('attaches user when token valid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    });
    mockRedisGetJson.mockResolvedValue({ role: 'author', avatarUrl: null });

    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as NextFunction);

    assert.equal(req.user?.id, 'user-1');
    assert.equal(req.token, VALID_TOKEN);
    assert.equal(next.mock.calls.length, 1);
  });

  it('sets user null and continues when getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));
    const req = mockReq({ authorization: `Bearer ${VALID_TOKEN}` });
    const res = mockRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as NextFunction);

    assert.equal(req.user, null);
    assert.equal(next.mock.calls.length, 1);
  });
});

describe('requireRole', () => {
  it('returns 401 when req.user is missing', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    const middleware = requireRole('author');

    middleware(req, res, next as NextFunction);

    assert.equal(res.statusCode, 401);
    assert.equal(next.mock.calls.length, 0);
  });

  it('returns 403 when role is insufficient', () => {
    const req = mockReq();
    req.user = { id: 'u1', email: 'a@b.com', role: 'user', avatarUrl: null };
    const res = mockRes();
    const next = vi.fn();
    const middleware = requireRole('author');

    middleware(req, res, next as NextFunction);

    assert.equal(res.statusCode, 403);
    assert.match(
      (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.error as string,
      /insufficient role/
    );
  });

  it('calls next when role meets minimum', () => {
    const req = mockReq();
    req.user = { id: 'u1', email: 'a@b.com', role: 'admin', avatarUrl: null };
    const res = mockRes();
    const next = vi.fn();
    const middleware = requireRole('author');

    middleware(req, res, next as NextFunction);

    assert.equal(next.mock.calls.length, 1);
  });
});

describe('invalidateProfileCache', () => {
  it('is callable without throwing', () => {
    assert.doesNotThrow(() => invalidateProfileCache('user-1'));
  });
});
