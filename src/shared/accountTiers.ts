/**
 * Account tier matrix for UI (marketing / comparison table).
 * Token limits SSOT: src/config/tokenLimits.ts
 */

import { TOKEN_LIMITS, isUnlimitedTokenLimit } from '../config/tokenLimits.js';
import type { UserRole } from '../types/roles.js';

/** Tiers shown as columns in the comparison table (excludes guest and admin). */
export type AccountTierId = 'user' | 'author' | 'author_plus' | 'super_author';

export const ACCOUNT_TIER_COLUMNS: AccountTierId[] = [
  'user',
  'author',
  'author_plus',
  'super_author',
];

export type TierFeatureId =
  | 'catalogReading'
  | 'profileHistory'
  | 'translationProjects'
  | 'glossaryPublishExport'
  | 'aiModelChoice'
  | 'translationReview'
  | 'dailyTokens'
  | 'parallelJobs';

export const TIER_FEATURE_ROWS: TierFeatureId[] = [
  'catalogReading',
  'profileHistory',
  'translationProjects',
  'glossaryPublishExport',
  'aiModelChoice',
  'translationReview',
  'dailyTokens',
  'parallelJobs',
];

export type TierFeatureStatus = 'yes' | 'no' | 'soon';

export const TIER_FEATURE_MATRIX: Record<
  Exclude<TierFeatureId, 'dailyTokens' | 'aiModelChoice'>,
  Record<AccountTierId, TierFeatureStatus>
> = {
  catalogReading: {
    user: 'yes',
    author: 'yes',
    author_plus: 'yes',
    super_author: 'yes',
  },
  profileHistory: {
    user: 'yes',
    author: 'yes',
    author_plus: 'yes',
    super_author: 'yes',
  },
  translationProjects: {
    user: 'no',
    author: 'yes',
    author_plus: 'yes',
    super_author: 'yes',
  },
  glossaryPublishExport: {
    user: 'no',
    author: 'yes',
    author_plus: 'yes',
    super_author: 'yes',
  },
  translationReview: {
    user: 'no',
    author: 'no',
    author_plus: 'yes',
    super_author: 'yes',
  },
  parallelJobs: {
    user: 'no',
    author: 'no',
    author_plus: 'soon',
    super_author: 'soon',
  },
};

/** AI model picker access per tier (text cells in comparison table). */
export type TierModelAccessLevel = 'no' | 'basic' | 'full';

export const TIER_MODEL_ACCESS_MATRIX: Record<AccountTierId, TierModelAccessLevel> = {
  user: 'no',
  author: 'basic',
  author_plus: 'full',
  super_author: 'full',
};

const TIER_TO_ROLE: Record<AccountTierId, UserRole> = {
  user: 'user',
  author: 'author',
  author_plus: 'author_plus',
  super_author: 'super_author',
};

/** Daily token limit for a tier column (from ROLE_DAILY_LIMITS). */
export function getDailyTokenLimitForTier(tierId: AccountTierId): number | 'unlimited' {
  const limit = TOKEN_LIMITS.ROLE_DAILY_LIMITS[TIER_TO_ROLE[tierId]];
  if (isUnlimitedTokenLimit(limit)) return 'unlimited';
  return limit;
}

/** Map user role to comparison column; null when not in the public tier table. */
export function roleToAccountTier(role: UserRole): AccountTierId | null {
  if (role === 'guest') return null;
  if (role === 'admin') return null;
  return role as AccountTierId;
}
