import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const { mockCreateRequestLogger, mockFlushLogs, mockInfo, mockWarn, mockError, mockWaitUntil } =
  vi.hoisted(() => {
    const mockInfo = vi.fn();
    const mockWarn = vi.fn();
    const mockError = vi.fn();
    const mockCreateRequestLogger = vi.fn(() => ({
      info: mockInfo,
      warn: mockWarn,
      error: mockError,
    }));
    const mockFlushLogs = vi.fn().mockResolvedValue(undefined);
    const mockWaitUntil = vi.fn();
    return {
      mockCreateRequestLogger,
      mockFlushLogs,
      mockInfo,
      mockWarn,
      mockError,
      mockWaitUntil,
    };
  });

vi.mock('../logger.js', () => ({
  createRequestLogger: mockCreateRequestLogger,
  flushLogs: mockFlushLogs,
  logger: { info: mockInfo, warn: mockWarn, error: mockError },
}));

vi.mock('./routeDebugError.js', () => ({
  getRouteDebugError: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: mockWaitUntil,
}));

import { requestContext, requestLogging } from './requestContext.js';
import { getInvocationAbortSignal } from '../shared/invocationAbort.js';

function mockRes() {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    statusCode: 200,
    writableEnded: false,
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
  return res as unknown as Response & { emit: (event: string) => void; writableEnded: boolean };
}

function mockReq(overrides: Partial<Request> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    headers: {},
    method: 'GET',
    path: '/api/projects',
    user: undefined,
    complete: true,
    on: vi.fn((event: string, handler: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
    }),
    emit: (event: string) => {
      for (const handler of listeners[event] ?? []) handler();
    },
    ...overrides,
  } as unknown as Request & { emit: (event: string) => void };
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

  it('aborts when the client drops the connection before the response ends', () => {
    const req = mockReq();
    const res = mockRes();
    let captured: AbortSignal | undefined;
    const next = vi.fn(() => {
      captured = getInvocationAbortSignal();
    });

    requestContext(req, res, next as NextFunction);

    assert.equal(captured?.aborted, false);
    res.emit('close');
    assert.equal(captured?.aborted, true);
  });

  it('does not abort on IncomingMessage close after a fully-read body', () => {
    const req = mockReq({ complete: true });
    const res = mockRes();
    let captured: AbortSignal | undefined;
    requestContext(req, res, (() => {
      captured = getInvocationAbortSignal();
    }) as NextFunction);
    req.emit('close');
    assert.equal(captured?.aborted, false);
  });

  it('aborts when the request is closed before the body is complete', () => {
    const req = mockReq({ complete: false });
    const res = mockRes();
    let captured: AbortSignal | undefined;
    requestContext(req, res, (() => {
      captured = getInvocationAbortSignal();
    }) as NextFunction);
    req.emit('close');
    assert.equal(captured?.aborted, true);
  });

  it('does not abort after the response has ended', () => {
    const req = mockReq();
    const res = mockRes();
    let captured: AbortSignal | undefined;
    requestContext(req, res, (() => {
      captured = getInvocationAbortSignal();
    }) as NextFunction);
    res.writableEnded = true;
    res.emit('close');
    assert.equal(captured?.aborted, false);
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

  it('does not call waitUntil when VERCEL is unset', () => {
    const prev = process.env.VERCEL;
    delete process.env.VERCEL;
    const req = mockReq();
    const res = mockRes();
    (req as unknown as { log: ReturnType<typeof mockCreateRequestLogger> }).log =
      mockCreateRequestLogger();

    requestLogging(req, res, vi.fn() as NextFunction);
    res.emit('finish');

    assert.equal(mockFlushLogs.mock.calls.length, 1);
    assert.equal(mockWaitUntil.mock.calls.length, 0);
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  });

  it('calls waitUntil(flushLogs) when VERCEL is set', () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = '1';
    const req = mockReq();
    const res = mockRes();
    (req as unknown as { log: ReturnType<typeof mockCreateRequestLogger> }).log =
      mockCreateRequestLogger();

    requestLogging(req, res, vi.fn() as NextFunction);
    res.emit('finish');

    assert.equal(mockFlushLogs.mock.calls.length, 1);
    assert.equal(mockWaitUntil.mock.calls.length, 1);
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  });
});
