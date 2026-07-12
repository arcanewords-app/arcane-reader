import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromBody, parseApiErrorBody } from './errors.js';

describe('parseApiErrorBody', () => {
  it('returns empty object for nullish input', () => {
    expect(parseApiErrorBody(null)).toEqual({});
    expect(parseApiErrorBody(undefined)).toEqual({});
    expect(parseApiErrorBody('')).toEqual({});
  });

  it('parses JSON string', () => {
    expect(parseApiErrorBody('{"error":"Not found","code":"NOT_FOUND"}')).toEqual({
      error: 'Not found',
      code: 'NOT_FOUND',
    });
  });

  it('returns empty object for invalid JSON string', () => {
    expect(parseApiErrorBody('not-json')).toEqual({});
  });

  it('passes through object input', () => {
    const body = { error: 'Forbidden', code: 'FORBIDDEN', service: 'supabase' };
    expect(parseApiErrorBody(body)).toBe(body);
  });
});

describe('apiErrorFromBody', () => {
  it('uses body.error when present', () => {
    const err = apiErrorFromBody({ error: 'Bad request', code: 'BAD' }, 400, 'HTTP 400');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Bad request');
    expect(err.status).toBe(400);
    expect(err.code).toBe('BAD');
  });

  it('falls back to default message', () => {
    const err = apiErrorFromBody({}, 500, 'HTTP 500');
    expect(err.message).toBe('HTTP 500');
    expect(err.status).toBe(500);
  });
});
