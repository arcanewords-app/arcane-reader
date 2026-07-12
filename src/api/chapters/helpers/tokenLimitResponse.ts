/**
 * Token limit 429 response builder — extracted from chapters routes.
 */

export interface TokenLimitCheckLike {
  allowed: boolean;
  message?: string;
  currentUsage?: number;
  limit?: number;
}

/** Midnight UTC of the next calendar day. */
export function midnightUtcResetAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
}

export function buildTokenLimit429Response(
  limitCheck: TokenLimitCheckLike,
  estimatedTokens: number,
  now = new Date()
): {
  error: string;
  message: string;
  currentUsage?: number;
  limit?: number;
  estimatedTokens: number;
  resetAt: string;
} {
  return {
    error: 'Token limit exceeded',
    message: limitCheck.message || 'Дневной лимит токенов исчерпан. Попробуйте завтра.',
    currentUsage: limitCheck.currentUsage,
    limit: limitCheck.limit,
    estimatedTokens,
    resetAt: midnightUtcResetAt(now).toISOString(),
  };
}
