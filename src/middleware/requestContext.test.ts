import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { mockCreateRequestLogger, mockFlushLogs, mockInfo, mockWarn, mockError } = vi.hoisted(() => {
  const mockInfo = vi.fn();
  const mockWarn = vi.fn();
  const mockError = vi.fn();
  const mockCreateRequestLogger = vi.fn(() => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  }));
  const mockFlushLogs = vi.fn().mockResolvedValue(undefined);
  return { mockCreateRequestLogger, mockFlushLogs, mockInfo, mockWarn, mockError };
});

vi.mock('../logger.js', () => ({
  createRequestLogger: mockCreateRequestLogger,
  flushLogs: mockFlushLogs,
  logger: { info: mockInfo, warn: mockWarn, error: mockError },
}));

vi.mock('./routeDebugError.js', () => ({
  getRouteDebugError: vi.fn(),
}));

import { requestContext, requestLogging } from './requestContext.js';

function mockRes() {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
    }),
    emit: (event: string) => {
      for (const handler of listeners[event] ?? []) handler();
    },
    locals: {},
  };
  return res as unknown as Response & { emit: (event: string) => void };
}

function mockReq(overrides: Partial<Request> = {}) {
  return {
    headers: {},
    method: 'GET',
    path: '/api/projects',
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

describe('requestContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses X-Request-Id header when provided', () => {
    const req = mockReq({ headers: { 'x-request-id': 'req-abc' } });
    const res = mockRes();
    const next = vi.fn();

    requestContext(req, res, next as NextFunction);

    assert.equal((req as Request & { id: string }).id, 'req-abc');
    assert.equal((res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], 'x-request-id');
    assert.equal((res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1], 'req-abc');
    assert.equal(next.mock.calls.length, 1);
  });

  it('generates request id when header is missing', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requestContext(req, res, next as NextFunction);

    const requestId = (req as Request & { id: string }).id;
    assert.ok(requestId.length > 0);
    assert.equal(
      (mockCreateRequestLogger as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.requestId,
      requestId
    );
  });

  it('attaches req.log with userId when user is present', () => {
    const req = mockReq({
      user: { id: 'user-1', email: 'a@b.com', role: 'author', avatarUrl: null },
    });
    const res = mockRes();
    const next = vi.fn();

    requestContext(req, res, next as NextFunction);

    assert.equal(
      (mockCreateRequestLogger as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.userId,
      'user-1'
    );
    assert.ok((req as Request & { log: unknown }).log);
  });
});

describe('requestLogging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs http.request on finish for normal routes', () => {
    const req = mockReq({
      user: { id: 'user-1', email: 'a@b.com', role: 'author', avatarUrl: null },
    });
    const res = mockRes();
    (req as unknown as { log: ReturnType<typeof mockCreateRequestLogger> }).log =
      mockCreateRequestLogger();
    const next = vi.fn();

    requestLogging(req, res, next as NextFunction);
    res.statusCode = 200;
    res.emit('finish');

    assert.equal(next.mock.calls.length, 1);
    assert.equal(mockInfo.mock.calls[0]?.[0]?.event, 'http.request');
    assert.equal(mockInfo.mock.calls[0]?.[0]?.statusCode, 200);
    assert.equal(mockInfo.mock.calls[0]?.[0]?.userId, 'user-1');
    assert.equal(mockFlushLogs.mock.calls.length, 1);
  });

  it('skips logging for debug viewer paths', () => {
    const req = mockReq({ path: '/api/debug/query' });
    const res = mockRes();
    (req as unknown as { log: ReturnType<typeof mockCreateRequestLogger> }).log =
      mockCreateRequestLogger();
    const next = vi.fn();

    requestLogging(req, res, next as NextFunction);
    res.emit('finish');

    assert.equal(mockInfo.mock.calls.length, 0);
  });

  it('logs warn level for 4xx responses', () => {
    const req = mockReq({ path: '/api/projects' });
    const res = mockRes();
    (req as unknown as { log: ReturnType<typeof mockCreateRequestLogger> }).log =
      mockCreateRequestLogger();
    const next = vi.fn();

    requestLogging(req, res, next as NextFunction);
    res.statusCode = 404;
    res.emit('finish');

    assert.equal(mockWarn.mock.calls[0]?.[0]?.statusCode, 404);
  });
});
