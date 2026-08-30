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

export const TOKEN_LIMIT_EXCEEDED_ERROR = 'Token limit exceeded';

export const DEFAULT_DAILY_CREDIT_LIMIT_MESSAGE =
  'Дневной лимит кредитов исчерпан. Попробуйте завтра.';

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
    error: TOKEN_LIMIT_EXCEEDED_ERROR,
    message: limitCheck.message || DEFAULT_DAILY_CREDIT_LIMIT_MESSAGE,
    currentUsage: limitCheck.currentUsage,
    limit: limitCheck.limit,
    estimatedTokens,
    resetAt: midnightUtcResetAt(now).toISOString(),
  };
}
