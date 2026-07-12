import { describe, expect, it } from 'vitest';
import { buildTokenLimit429Response, midnightUtcResetAt } from './tokenLimitResponse.js';

describe('tokenLimitResponse', () => {
  it('midnightUtcResetAt is start of next UTC day', () => {
    const now = new Date('2026-07-12T15:30:00Z');
    expect(midnightUtcResetAt(now).toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('buildTokenLimit429Response includes limit check fields', () => {
    const now = new Date('2026-07-12T10:00:00Z');
    const body = buildTokenLimit429Response(
      {
        allowed: false,
        message: 'Custom limit message',
        currentUsage: 9000,
        limit: 10000,
      },
      500,
      now
    );
    expect(body).toEqual({
      error: 'Token limit exceeded',
      message: 'Custom limit message',
      currentUsage: 9000,
      limit: 10000,
      estimatedTokens: 500,
      resetAt: '2026-07-13T00:00:00.000Z',
    });
  });

  it('uses default Russian message when limit check has no message', () => {
    const body = buildTokenLimit429Response({ allowed: false }, 100);
    expect(body.message).toContain('лимит');
  });
});
