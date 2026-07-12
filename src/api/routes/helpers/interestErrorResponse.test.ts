import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { interestErrorResponse } from './interestErrorResponse.js';

function mockRes() {
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
  return res;
}

describe('interestErrorResponse', () => {
  it('maps NOT_FOUND to 404', () => {
    const res = mockRes();
    const handled = interestErrorResponse(
      Object.assign(new Error('x'), { code: 'NOT_FOUND' }),
      res as never
    );
    assert.equal(handled, true);
    assert.equal(res.statusCode, 404);
  });

  it('maps SELF_ASSIGN to 409', () => {
    const res = mockRes();
    const handled = interestErrorResponse(
      Object.assign(new Error('x'), { code: 'SELF_ASSIGN' }),
      res as never
    );
    assert.equal(handled, true);
    assert.equal((res.body as { code?: string }).code, 'SELF_ASSIGN');
  });

  it('returns false for unknown errors', () => {
    const res = mockRes();
    assert.equal(interestErrorResponse(new Error('other'), res as never), false);
  });
});
