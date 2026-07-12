const WARNING_THRESHOLD = 0.8;

export type TokenLimitCheckResult = 'ok' | 'warn' | 'block';

const isUnlimited = (limit: number) => limit < 0;

export function checkTokenLimitStatus(
  tokenUsage: { tokensUsed: number; tokensLimit: number; tokensBlocked?: number } | null,
  estimatedTokens: number,
  authenticated: boolean
): TokenLimitCheckResult {
  if (!tokenUsage || !authenticated) return 'ok';
  if (isUnlimited(tokenUsage.tokensLimit)) return 'ok';

  const effectiveUsed = tokenUsage.tokensUsed + (tokenUsage.tokensBlocked ?? 0);
  const tokensAfter = effectiveUsed + estimatedTokens;
  const willExceed = tokensAfter > tokenUsage.tokensLimit;
  const percentageAfter = (tokensAfter / tokenUsage.tokensLimit) * 100;
  const shouldWarn = percentageAfter >= WARNING_THRESHOLD * 100;

  if (willExceed) return 'block';
  if (shouldWarn) return 'warn';
  return 'ok';
}
