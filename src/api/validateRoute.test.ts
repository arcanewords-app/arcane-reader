import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  normalizeQueryRecord,
  normalizeQueryValue,
  parseParams,
  parseQuery,
  sendZodValidationError,
  validateParams,
  validateQuery,
} from './validateRoute.js';

describe('validateRoute helpers', () => {
  it('normalizeQueryValue picks first string from array', () => {
    assert.equal(normalizeQueryValue(['a', 'b']), 'a');
    assert.equal(normalizeQueryValue('x'), 'x');
    assert.equal(normalizeQueryValue(undefined), undefined);
  });

  it('normalizeQueryRecord flattens query object', () => {
    const flat = normalizeQueryRecord({ limit: '10', tag: ['a', 'b'] });
    assert.deepEqual(flat, { limit: '10', tag: 'a' });
  });

  it('Zod parses normalized query', () => {
    const schema = z.object({ limit: z.coerce.number().optional() });
    const parsed = schema.safeParse(normalizeQueryRecord({ limit: '5' }));
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.limit, 5);
  });
});

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

function mockReq(overrides: { params?: Request['params']; query?: Request['query'] }): Request {
  return overrides as unknown as Request;
}

describe('sendZodValidationError', () => {
  it('returns 400 with flattened field errors', () => {
    const res = mockRes();
    const schema = z.object({ id: z.string().uuid() });
    const parsed = schema.safeParse({ id: 'not-uuid' });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      sendZodValidationError(res, parsed.error);
    }
    assert.equal(res.statusCode, 400);
    assert.deepEqual((res.body as { error: string }).error, 'Validation failed');
  });
});

describe('validateParams middleware', () => {
  const schema = z.object({ projectId: z.string().min(1) });

  it('sets validatedParams and calls next on success', () => {
    const handler = validateParams(schema);
    const req = mockReq({ params: { projectId: 'proj-1' } });
    const res = mockRes();
    const next = vi.fn();
    handler(req, res, next);
    assert.equal((req.validatedParams as z.infer<typeof schema>).projectId, 'proj-1');
    assert.equal(next.mock.calls.length, 1);
  });

  it('responds 400 when params invalid', () => {
    const handler = validateParams(schema);
    const req = mockReq({ params: { projectId: '' } });
    const res = mockRes();
    const next = vi.fn();
    handler(req, res, next);
    assert.equal(res.statusCode, 400);
    assert.equal(next.mock.calls.length, 0);
  });

  it('normalizes array params to first value', () => {
    const handler = validateParams(schema);
    const req = mockReq({ params: { projectId: ['p1', 'p2'] } });
    const res = mockRes();
    const next = vi.fn();
    handler(req, res, next);
    assert.equal((req.validatedParams as z.infer<typeof schema>).projectId, 'p1');
    assert.equal(next.mock.calls.length, 1);
  });
});

describe('validateQuery middleware', () => {
  const schema = z.object({ limit: z.coerce.number().int().positive().optional() });

  it('sets validatedQuery on success', () => {
    const handler = validateQuery(schema);
    const req = mockReq({ query: { limit: '10' } });
    const res = mockRes();
    const next = vi.fn();
    handler(req, res, next);
    assert.equal((req.validatedQuery as z.infer<typeof schema>).limit, 10);
    assert.equal(next.mock.calls.length, 1);
  });

  it('responds 400 on invalid query', () => {
    const handler = validateQuery(schema);
    const req = mockReq({ query: { limit: 'nope' } });
    const res = mockRes();
    const next = vi.fn();
    handler(req, res, next);
    assert.equal(res.statusCode, 400);
    assert.equal(next.mock.calls.length, 0);
  });
});

describe('parseQuery', () => {
  it('returns parsed data or null after sending 400', () => {
    const schema = z.object({ q: z.string().optional() });
    const req = mockReq({ query: { q: 'hello' } });
    const res = mockRes();
    assert.deepEqual(parseQuery(schema, req, res), { q: 'hello' });

    const badReq = mockReq({ query: { limit: 'not-a-number' } });
    const badRes = mockRes();
    const badSchema = z.object({ limit: z.coerce.number().int() });
    assert.equal(parseQuery(badSchema, badReq, badRes), null);
    assert.equal(badRes.statusCode, 400);
  });
});

describe('parseParams', () => {
  it('returns parsed params or null', () => {
    const schema = z.object({ id: z.string() });
    const req = mockReq({ params: { id: 'ch-1' } });
    const res = mockRes();
    assert.deepEqual(parseParams(schema, req, res), { id: 'ch-1' });

    const badReq = mockReq({ params: {} });
    const badRes = mockRes();
    assert.equal(parseParams(schema, badReq, badRes), null);
    assert.equal(badRes.statusCode, 400);
  });
});
