import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  INVALID_TRANSLATOR_PSEUDONYM_CODE,
  TRANSLATOR_PSEUDONYM_LIMIT_CODE,
} from '../../../shared/translatorPseudonyms.js';
import { translatorPseudonymErrorResponse } from './translatorPseudonymErrorResponse.js';

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

describe('translatorPseudonymErrorResponse', () => {
  it('returns true and 409 for limit code', () => {
    const res = mockRes();
    const err = Object.assign(new Error('limit'), {
      code: TRANSLATOR_PSEUDONYM_LIMIT_CODE,
      limit: 3,
      current: 3,
    });
    const handled = translatorPseudonymErrorResponse(err, res as never);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 409);
    assert.equal((res.body as { code: string }).code, TRANSLATOR_PSEUDONYM_LIMIT_CODE);
  });

  it('returns true and 400 for invalid pseudonym code', () => {
    const res = mockRes();
    const err = Object.assign(new Error('invalid'), { code: INVALID_TRANSLATOR_PSEUDONYM_CODE });
    const handled = translatorPseudonymErrorResponse(err, res as never);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 400);
  });

  it('returns false for unknown errors', () => {
    const res = mockRes();
    const handled = translatorPseudonymErrorResponse(new Error('other'), res as never);
    assert.equal(handled, false);
  });
});
