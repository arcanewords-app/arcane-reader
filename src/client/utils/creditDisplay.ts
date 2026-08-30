/**
 * Display-only credit view of daily token quota.
 * 1 credit = 1 LLM token. API / DB still use tokens*.
 */

export type CreditColorClass = 'normal' | 'caution' | 'warning' | 'critical';

export interface CreditUsageInput {
  tokensUsed: number;
  tokensLimit: number;
  tokensBlocked?: number;
  tokensRemaining?: number;
}

export interface CreditDisplay {
  unlimited: boolean;
  remaining: number;
  limit: number;
  remainingPercent: number;
  colorClass: CreditColorClass;
}

export function isUnlimitedCreditLimit(limit: number): boolean {
  return limit < 0;
}

/** Remaining credits for today (clamped ≥ 0). Unlimited → -1. */
export function creditsRemaining(usage: CreditUsageInput): number {
  if (isUnlimitedCreditLimit(usage.tokensLimit)) return -1;
  if (typeof usage.tokensRemaining === 'number') {
    return Math.max(0, usage.tokensRemaining);
  }
  const blocked = usage.tokensBlocked ?? 0;
  return Math.max(0, usage.tokensLimit - usage.tokensUsed - blocked);
}

export function creditColorClass(remainingPercent: number): CreditColorClass {
  if (remainingPercent <= 5) return 'critical';
  if (remainingPercent <= 20) return 'warning';
  if (remainingPercent <= 50) return 'caution';
  return 'normal';
}

export function getCreditDisplay(usage: CreditUsageInput): CreditDisplay {
  const unlimited = isUnlimitedCreditLimit(usage.tokensLimit);
  const remaining = creditsRemaining(usage);
  const remainingPercent =
    unlimited || usage.tokensLimit <= 0 ? 0 : (remaining / usage.tokensLimit) * 100;
  return {
    unlimited,
    remaining,
    limit: usage.tokensLimit,
    remainingPercent,
    colorClass: unlimited ? 'normal' : creditColorClass(remainingPercent),
  };
}

export function creditsAfterEstimate(
  usage: CreditUsageInput,
  estimatedCredits: number
): {
  remainingNow: number;
  remainingAfter: number;
  willExceed: boolean;
  remainingPercentAfter: number;
} {
  const unlimited = isUnlimitedCreditLimit(usage.tokensLimit);
  const remainingNow = creditsRemaining(usage);
  if (unlimited) {
    return {
      remainingNow: -1,
      remainingAfter: -1,
      willExceed: false,
      remainingPercentAfter: 0,
    };
  }
  const remainingAfter = Math.max(0, remainingNow - estimatedCredits);
  const willExceed = remainingNow < estimatedCredits;
  const remainingPercentAfter =
    usage.tokensLimit <= 0 ? 0 : (remainingAfter / usage.tokensLimit) * 100;
  return { remainingNow, remainingAfter, willExceed, remainingPercentAfter };
}
