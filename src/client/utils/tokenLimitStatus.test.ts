import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { checkTokenLimitStatus } from './tokenLimitStatus.js';

describe('checkTokenLimitStatus', () => {
  it('returns ok for unauthenticated users', () => {
    assert.equal(checkTokenLimitStatus(null, 1000, false), 'ok');
  });

  it('returns ok for unlimited quota', () => {
    assert.equal(checkTokenLimitStatus({ tokensUsed: 100, tokensLimit: -1 }, 500, true), 'ok');
  });

  it('returns block when estimate exceeds limit', () => {
    assert.equal(
      checkTokenLimitStatus({ tokensUsed: 900, tokensLimit: 1000, tokensBlocked: 0 }, 200, true),
      'block'
    );
  });

  it('returns warn when usage crosses 80% threshold', () => {
    assert.equal(
      checkTokenLimitStatus({ tokensUsed: 700, tokensLimit: 1000, tokensBlocked: 0 }, 100, true),
      'warn'
    );
  });
});
