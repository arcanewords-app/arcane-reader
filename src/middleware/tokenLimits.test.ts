import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { TOKEN_LIMITS } from '../config/tokenLimits.js';

const { mockFrom, mockValidateToken } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockValidateToken: vi.fn(),
}));

vi.mock('../services/supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../utils/tokenValidation.js', () => ({
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
}));

import { checkTokenLimit, getUserTokenUsage } from './tokenLimits.js';

const VALID_TOKEN = 'header.payload.signature';

function chainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'single']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('getUserTokenUsage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped usage when record exists', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          tokens_used: 10000,
          tokens_blocked: 5000,
          tokens_by_stage: { analysis: 2000, translation: 7000, editing: 1000 },
        },
        error: null,
      })
    );

    const usage = await getUserTokenUsage('user-1', VALID_TOKEN, '2026-07-12', 'author');

    assert.equal(usage.date, '2026-07-12');
    assert.equal(usage.tokensUsed, 10000);
    assert.equal(usage.tokensBlocked, 5000);
    assert.equal(usage.tokensLimit, TOKEN_LIMITS.ROLE_DAILY_LIMITS.author);
    assert.equal(usage.tokensRemaining, 35000);
    assert.equal(usage.percentageUsed, 30);
    assert.equal(usage.warning, false);
    assert.deepEqual(usage.tokensByStage, {
      analysis: 2000,
      translation: 7000,
      editing: 1000,
    });
    assert.equal(mockValidateToken.mock.calls[0]?.[0], VALID_TOKEN);
  });

  it('returns zero usage when no record (PGRST116)', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const usage = await getUserTokenUsage('user-1', VALID_TOKEN, undefined, 'author');

    assert.equal(usage.tokensUsed, 0);
    assert.equal(usage.tokensBlocked, 0);
    assert.equal(usage.tokensRemaining, TOKEN_LIMITS.ROLE_DAILY_LIMITS.author);
    assert.equal(usage.warning, false);
  });

  it('returns unlimited remaining for admin role', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { tokens_used: 999999, tokens_blocked: 0, tokens_by_stage: {} },
        error: null,
      })
    );

    const usage = await getUserTokenUsage('admin-1', VALID_TOKEN, undefined, 'admin');

    assert.equal(usage.tokensLimit, TOKEN_LIMITS.UNLIMITED_LIMIT);
    assert.equal(usage.tokensRemaining, -1);
    assert.equal(usage.percentageUsed, 0);
    assert.equal(usage.warning, false);
  });

  it('throws on unexpected database error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: '500', message: 'db down' },
      })
    );

    await assert.rejects(
      () => getUserTokenUsage('user-1', VALID_TOKEN),
      /Failed to get token usage/
    );
  });
});

describe('checkTokenLimit', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows request when estimated tokens fit within limit', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          tokens_used: 10000,
          tokens_blocked: 5000,
          tokens_by_stage: { translation: 10000 },
        },
        error: null,
      })
    );

    const check = await checkTokenLimit('user-1', VALID_TOKEN, 10000, 'author');

    assert.equal(check.allowed, true);
    assert.equal(check.currentUsage, 15000);
    assert.equal(check.limit, TOKEN_LIMITS.ROLE_DAILY_LIMITS.author);
    assert.equal(check.remaining, 35000);
    assert.equal(check.warning, false);
    assert.equal(check.message, undefined);
  });

  it('denies request when estimated tokens exceed limit', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          tokens_used: 45000,
          tokens_blocked: 0,
          tokens_by_stage: { translation: 45000 },
        },
        error: null,
      })
    );

    const check = await checkTokenLimit('user-1', VALID_TOKEN, 10000, 'author');

    assert.equal(check.allowed, false);
    assert.equal(check.currentUsage, 45000);
    assert.match(check.message ?? '', /Дневной лимит токенов исчерпан/);
  });

  it('sets warning when usage is above threshold', async () => {
    const warningThreshold = TOKEN_LIMITS.ROLE_DAILY_LIMITS.author * TOKEN_LIMITS.WARNING_THRESHOLD;
    mockFrom.mockReturnValue(
      chainable({
        data: {
          tokens_used: warningThreshold + 1000,
          tokens_blocked: 0,
          tokens_by_stage: { translation: warningThreshold + 1000 },
        },
        error: null,
      })
    );

    const check = await checkTokenLimit('user-1', VALID_TOKEN, 1000, 'author');

    assert.equal(check.allowed, true);
    assert.equal(check.warning, true);
    assert.match(check.message ?? '', /Приближение к лимиту токенов/);
  });

  it('always allows admin regardless of usage', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          tokens_used: 999999,
          tokens_blocked: 0,
          tokens_by_stage: { translation: 999999 },
        },
        error: null,
      })
    );

    const check = await checkTokenLimit('admin-1', VALID_TOKEN, 500000, 'admin');

    assert.equal(check.allowed, true);
    assert.equal(check.remaining, -1);
  });
});
