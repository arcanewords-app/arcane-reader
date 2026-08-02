import { vi } from 'vitest';

export const tokenLimitMocks = {
  checkTokenLimit: vi.fn(),
  releaseTokens: vi.fn(),
  reserveTokens: vi.fn(),
  incrementTokenUsage: vi.fn(),
  getUserTokenUsage: vi.fn(),
};

export function resetTokenLimitMocks(): void {
  for (const fn of Object.values(tokenLimitMocks)) {
    fn.mockReset();
  }
  tokenLimitMocks.checkTokenLimit.mockResolvedValue({
    allowed: true,
    currentUsage: 0,
    limit: 1_000_000,
    remaining: 1_000_000,
    warning: false,
  });
  tokenLimitMocks.releaseTokens.mockResolvedValue(undefined);
  tokenLimitMocks.reserveTokens.mockResolvedValue(undefined);
  tokenLimitMocks.incrementTokenUsage.mockResolvedValue(undefined);
  tokenLimitMocks.getUserTokenUsage.mockResolvedValue({
    date: '2026-01-01',
    tokensUsed: 0,
    tokensBlocked: 0,
    tokensLimit: 1_000_000,
    tokensRemaining: 1_000_000,
    percentageUsed: 0,
    warning: false,
  });
}

resetTokenLimitMocks();

export async function installTokenLimitMocks() {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../../src/middleware/tokenLimits.js'
  );
  return {
    ...actual,
    ...tokenLimitMocks,
  };
}
