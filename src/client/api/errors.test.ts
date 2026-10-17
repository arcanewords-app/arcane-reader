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

  it('reads Vercel nested 413 payload without stringifying the object', () => {
    const err = apiErrorFromBody(
      { error: { code: '413', message: 'Request Entity Too Large' } },
      413,
      'HTTP 413'
    );
    expect(err.message).toBe('Request Entity Too Large');
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.message).not.toContain('[object Object]');
  });

  it('maps a response payload that is too large to its own code', () => {
    const err = apiErrorFromBody(
      {
        error: {
          code: 'FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE',
          message: 'Response payload too large',
        },
      },
      500,
      'HTTP 500'
    );
    expect(err.code).toBe('RESPONSE_PAYLOAD_TOO_LARGE');
    expect(err.message).toBe('Response payload too large');
  });

  it('uses a string fallback when the nested error has no message', () => {
    const err = apiErrorFromBody({ error: { code: 'FUNCTION_PAYLOAD_TOO_LARGE' } }, 413, {
      unexpected: true,
    });
    expect(err.message).toBe('HTTP 413');
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
