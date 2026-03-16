/**
 * Token Limits Middleware
 *
 * Provides functions to check and manage user token limits
 */

import {
  createClientWithToken,
  createServiceRoleClient,
} from '../services/supabaseClient.js';
import { validateToken } from '../utils/tokenValidation.js';
import {
  TOKEN_LIMITS,
  getTokenLimitForRole,
  isUnlimitedTokenLimit,
} from '../config/tokenLimits.js';
import type { UserRole } from '../types/roles.js';
import { CACHE_PREFIX } from '../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../services/redisCache.js';

export interface TokenUsage {
  date: string;
  tokensUsed: number;
  /** Tokens reserved for in-progress jobs (count toward limit) */
  tokensBlocked: number;
  tokensLimit: number;
  tokensRemaining: number;
  percentageUsed: number;
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  };
  warning: boolean;
}

export interface TokenLimitCheck {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  warning?: boolean;
  message?: string;
}

/**
 * Get current date in UTC (YYYY-MM-DD format)
 */
function getCurrentDateUTC(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get user's token usage for today.
 * @param role - User role; limit is taken from ROLE_DAILY_LIMITS. Defaults to 'user'.
 */
export async function getUserTokenUsage(
  userId: string,
  token: string,
  date?: string,
  role: UserRole = 'user'
): Promise<TokenUsage> {
  validateToken(token);
  const client = createClientWithToken(token);
  const targetDate = date || getCurrentDateUTC();
  const tokensLimit = getTokenLimitForRole(role);

  const { data, error } = await client
    .from('user_token_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get token usage: ${error.message}`);
  }

  const tokensUsed = data?.tokens_used || 0;
  const tokensBlocked = data?.tokens_blocked ?? 0;
  const tokensByStage = data?.tokens_by_stage || {
    analysis: 0,
    translation: 0,
    editing: 0,
  };

  const unlimited = isUnlimitedTokenLimit(tokensLimit);
  const effectiveUsed = tokensUsed + tokensBlocked;
  const tokensRemaining = unlimited ? -1 : Math.max(0, tokensLimit - effectiveUsed);
  const percentageUsed = unlimited || tokensLimit <= 0 ? 0 : (effectiveUsed / tokensLimit) * 100;
  const warning =
    !unlimited && tokensLimit > 0 && percentageUsed >= TOKEN_LIMITS.WARNING_THRESHOLD * 100;

  return {
    date: targetDate,
    tokensUsed,
    tokensBlocked,
    tokensLimit,
    tokensRemaining,
    percentageUsed,
    tokensByStage: {
      analysis: tokensByStage.analysis,
      translation: tokensByStage.translation,
      editing: tokensByStage.editing,
    },
    warning,
  };
}

/**
 * Check if user can use estimated tokens.
 * @param role - User role; limit is taken from ROLE_DAILY_LIMITS. Defaults to 'author'.
 */
export async function checkTokenLimit(
  userId: string,
  token: string,
  estimatedTokens: number,
  role: UserRole = 'author'
): Promise<TokenLimitCheck> {
  const usage = await getUserTokenUsage(userId, token, undefined, role);
  const { tokensLimit } = usage;
  const unlimited = isUnlimitedTokenLimit(tokensLimit);

  const effectiveUsed = usage.tokensUsed + usage.tokensBlocked;
  const totalAfterTranslation = effectiveUsed + estimatedTokens;
  const allowed = unlimited || totalAfterTranslation <= tokensLimit;
  const remaining = unlimited ? -1 : Math.max(0, tokensLimit - effectiveUsed);
  const warning = !unlimited && usage.percentageUsed >= TOKEN_LIMITS.WARNING_THRESHOLD * 100;

  let message: string | undefined;
  if (!unlimited && !allowed) {
    message = `Дневной лимит токенов исчерпан. Использовано: ${usage.tokensUsed.toLocaleString()} / ${tokensLimit.toLocaleString()}. Лимит сбросится завтра в 00:00 UTC.`;
  } else if (!unlimited && warning) {
    message = `Приближение к лимиту токенов. Использовано: ${usage.tokensUsed.toLocaleString()} / ${tokensLimit.toLocaleString()}. После перевода останется: ${(remaining - estimatedTokens).toLocaleString()} токенов.`;
  }

  return {
    allowed,
    currentUsage: effectiveUsed,
    limit: tokensLimit,
    remaining,
    warning,
    message,
  };
}

/**
 * Increment user's token usage
 * Creates record if it doesn't exist
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function incrementTokenUsage(
  userId: string,
  token: string,
  tokensUsed: number,
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  },
  options?: { useServiceRole?: boolean }
): Promise<void> {
  if (!options?.useServiceRole) {
    validateToken(token);
  }
  const client = options?.useServiceRole
    ? createServiceRoleClient()
    : createClientWithToken(token);
  const date = getCurrentDateUTC();
  const cacheKeysToInvalidate = [
    buildRedisKey(CACHE_PREFIX.userTokenUsage, userId, date),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 7),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 30),
  ];

  try {
    const { error: rpcError } = await client.rpc('increment_token_usage_atomic', {
      p_user_id: userId,
      p_date: date,
      p_tokens_used: tokensUsed,
      p_tokens_analysis: tokensByStage?.analysis ?? 0,
      p_tokens_translation: tokensByStage?.translation ?? 0,
      p_tokens_editing: tokensByStage?.editing ?? 0,
    });
    if (!rpcError) {
      await redisDelMany(cacheKeysToInvalidate);
      return;
    }
  } catch {
    // RPC may not exist yet; fallback to legacy behavior below.
  }

  // Get current usage
  const { data: existing } = await client
    .from('user_token_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  const currentTokensUsed = existing?.tokens_used || 0;
  const currentTokensByStage = existing?.tokens_by_stage || {
    analysis: 0,
    translation: 0,
    editing: 0,
  };

  // Calculate new values
  const newTokensUsed = currentTokensUsed + tokensUsed;
  const newTokensByStage = {
    analysis: (currentTokensByStage.analysis || 0) + (tokensByStage?.analysis || 0),
    translation: (currentTokensByStage.translation || 0) + (tokensByStage?.translation || 0),
    editing: (currentTokensByStage.editing || 0) + (tokensByStage?.editing || 0),
  };

  // Upsert (insert or update)
  const { error } = await client.from('user_token_usage').upsert(
    {
      user_id: userId,
      date,
      tokens_used: newTokensUsed,
      tokens_by_stage: newTokensByStage,
    },
    {
      onConflict: 'user_id,date',
    }
  );

  if (error) {
    const { logger } = await import('../logger.js');
    logger.error({ err: error }, 'Failed to increment token usage');
    return;
  }
  await redisDelMany(cacheKeysToInvalidate);
}

/**
 * Reserve tokens for a job (add to tokens_blocked).
 * Call before starting a background job.
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function reserveTokens(
  userId: string,
  token: string,
  tokensToReserve: number,
  options?: { useServiceRole?: boolean }
): Promise<void> {
  if (tokensToReserve <= 0) return;
  if (!options?.useServiceRole) {
    validateToken(token);
  }
  const client =
    options?.useServiceRole === true
      ? createServiceRoleClient()
      : createClientWithToken(token);
  const date = getCurrentDateUTC();
  const cacheKeysToInvalidate = [
    buildRedisKey(CACHE_PREFIX.userTokenUsage, userId, date),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 7),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 30),
  ];

  const { data: existing } = await client
    .from('user_token_usage')
    .select('tokens_used, tokens_blocked, tokens_by_stage')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  const currentBlocked = existing?.tokens_blocked ?? 0;
  const newBlocked = currentBlocked + tokensToReserve;

  const { error } = await client.from('user_token_usage').upsert(
    {
      user_id: userId,
      date,
      tokens_used: existing?.tokens_used ?? 0,
      tokens_blocked: newBlocked,
      tokens_by_stage: existing?.tokens_by_stage ?? {
        analysis: 0,
        translation: 0,
        editing: 0,
      },
    },
    {
      onConflict: 'user_id,date',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    const { logger } = await import('../logger.js');
    logger.error({ err: error }, 'Failed to reserve tokens');
    throw new Error(`Failed to reserve tokens: ${error.message}`);
  }
  await redisDelMany(cacheKeysToInvalidate);
}

/**
 * Release reserved tokens and optionally add actual usage (on job success).
 * Call when job completes (success/error/cancel).
 * @param tokensToRelease - Amount that was reserved (to subtract from tokens_blocked)
 * @param tokensActual - Actual tokens used (to add to tokens_used on success)
 * @param options.useServiceRole - Use service role client
 */
export async function releaseTokens(
  userId: string,
  tokensToRelease: number,
  options?: {
    tokensActual?: number;
    tokensByStage?: {
      analysis?: number;
      translation: number;
      editing?: number;
    };
    useServiceRole?: boolean;
  }
): Promise<void> {
  const client = createServiceRoleClient();
  const date = getCurrentDateUTC();
  const cacheKeysToInvalidate = [
    buildRedisKey(CACHE_PREFIX.userTokenUsage, userId, date),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 7),
    buildRedisKey(CACHE_PREFIX.userTokenHistory, userId, 30),
  ];

  const { data: existing } = await client
    .from('user_token_usage')
    .select('tokens_used, tokens_blocked, tokens_by_stage')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  const currentBlocked = existing?.tokens_blocked ?? 0;
  const newBlocked = Math.max(0, currentBlocked - tokensToRelease);
  let newTokensUsed = existing?.tokens_used ?? 0;
  let newTokensByStage = existing?.tokens_by_stage ?? {
    analysis: 0,
    translation: 0,
    editing: 0,
  };

  if (options?.tokensActual != null && options.tokensActual > 0 && options.tokensByStage) {
    newTokensUsed += options.tokensActual;
    newTokensByStage = {
      analysis: (newTokensByStage.analysis || 0) + (options.tokensByStage.analysis ?? 0),
      translation:
        (newTokensByStage.translation || 0) + (options.tokensByStage.translation ?? 0),
      editing: (newTokensByStage.editing || 0) + (options.tokensByStage.editing ?? 0),
    };
  }

  const { error } = await client.from('user_token_usage').upsert(
    {
      user_id: userId,
      date,
      tokens_blocked: newBlocked,
      tokens_used: newTokensUsed,
      tokens_by_stage: newTokensByStage,
    },
    {
      onConflict: 'user_id,date',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    const { logger } = await import('../logger.js');
    logger.error({ err: error }, 'Failed to release tokens');
    return;
  }
  await redisDelMany(cacheKeysToInvalidate);
}

/**
 * Get token usage history for user.
 * @param role - User role; tokensLimit in each record uses ROLE_DAILY_LIMITS. Defaults to 'user'.
 */
export async function getTokenUsageHistory(
  userId: string,
  token: string,
  days: number = 7,
  role: UserRole = 'user'
): Promise<Array<{ date: string; tokensUsed: number; tokensLimit: number }>> {
  validateToken(token);
  const client = createClientWithToken(token);
  const tokensLimit = getTokenLimitForRole(role);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const { data, error } = await client
    .from('user_token_usage')
    .select('date, tokens_used')
    .eq('user_id', userId)
    .gte('date', cutoffDateStr)
    .order('date', { ascending: false });

  if (error) {
    throw new Error(`Failed to get token usage history: ${error.message}`);
  }

  return (data || []).map((record) => ({
    date: record.date,
    tokensUsed: record.tokens_used,
    tokensLimit,
  }));
}
