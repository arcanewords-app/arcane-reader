/**
 * Token Limits Middleware
 * 
 * Provides functions to check and manage user token limits
 */

import { createClientWithToken } from '../services/supabaseClient.js';
import { validateToken } from '../utils/tokenValidation.js';
import { TOKEN_LIMITS } from '../config/tokenLimits.js';

export interface TokenUsage {
  date: string;
  tokensUsed: number;
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
 * Get user's token usage for today
 */
export async function getUserTokenUsage(
  userId: string,
  token: string,
  date?: string
): Promise<TokenUsage> {
  validateToken(token);
  const client = createClientWithToken(token);
  const targetDate = date || getCurrentDateUTC();

  // Get or create token usage record for today
  const { data, error } = await client
    .from('user_token_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found, which is OK (we'll create it)
    throw new Error(`Failed to get token usage: ${error.message}`);
  }

  const tokensUsed = data?.tokens_used || 0;
  const tokensByStage = data?.tokens_by_stage || {
    analysis: 0,
    translation: 0,
    editing: 0,
  };

  const tokensRemaining = Math.max(0, TOKEN_LIMITS.DAILY_LIMIT - tokensUsed);
  const percentageUsed = (tokensUsed / TOKEN_LIMITS.DAILY_LIMIT) * 100;
  const warning = percentageUsed >= TOKEN_LIMITS.WARNING_THRESHOLD * 100;

  return {
    date: targetDate,
    tokensUsed,
    tokensLimit: TOKEN_LIMITS.DAILY_LIMIT,
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
 * Check if user can use estimated tokens
 */
export async function checkTokenLimit(
  userId: string,
  token: string,
  estimatedTokens: number
): Promise<TokenLimitCheck> {
  const usage = await getUserTokenUsage(userId, token);
  
  const totalAfterTranslation = usage.tokensUsed + estimatedTokens;
  const allowed = totalAfterTranslation <= TOKEN_LIMITS.DAILY_LIMIT;
  const remaining = Math.max(0, TOKEN_LIMITS.DAILY_LIMIT - usage.tokensUsed);
  const warning = usage.percentageUsed >= TOKEN_LIMITS.WARNING_THRESHOLD * 100;

  let message: string | undefined;
  if (!allowed) {
    message = `Дневной лимит токенов исчерпан. Использовано: ${usage.tokensUsed.toLocaleString()} / ${TOKEN_LIMITS.DAILY_LIMIT.toLocaleString()}. Лимит сбросится завтра в 00:00 UTC.`;
  } else if (warning) {
    message = `Приближение к лимиту токенов. Использовано: ${usage.tokensUsed.toLocaleString()} / ${TOKEN_LIMITS.DAILY_LIMIT.toLocaleString()}. После перевода останется: ${(remaining - estimatedTokens).toLocaleString()} токенов.`;
  }

  return {
    allowed,
    currentUsage: usage.tokensUsed,
    limit: TOKEN_LIMITS.DAILY_LIMIT,
    remaining,
    warning,
    message,
  };
}

/**
 * Increment user's token usage
 * Creates record if it doesn't exist
 */
export async function incrementTokenUsage(
  userId: string,
  token: string,
  tokensUsed: number,
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  }
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);
  const date = getCurrentDateUTC();

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
  const { error } = await client
    .from('user_token_usage')
    .upsert({
      user_id: userId,
      date,
      tokens_used: newTokensUsed,
      tokens_by_stage: newTokensByStage,
    }, {
      onConflict: 'user_id,date',
    });

  if (error) {
    console.error('Failed to increment token usage:', error);
    // Don't throw - token tracking shouldn't block translation
    // But log it for monitoring
  } else {
    console.log(`📊 Token usage updated: ${currentTokensUsed} → ${newTokensUsed} tokens`);
  }
}

/**
 * Get token usage history for user
 */
export async function getTokenUsageHistory(
  userId: string,
  token: string,
  days: number = 7
): Promise<Array<{ date: string; tokensUsed: number; tokensLimit: number }>> {
  validateToken(token);
  const client = createClientWithToken(token);

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
    tokensLimit: TOKEN_LIMITS.DAILY_LIMIT,
  }));
}
