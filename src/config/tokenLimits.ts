/**
 * Token Limits Configuration
 *
 * Defines daily token limits per role and calculation coefficients for translation
 */

import type { UserRole } from '../types/roles.js';

export const TOKEN_LIMITS = {
  /** Default daily limit for role 'author' (kept for backward compat / docs) */
  DAILY_LIMIT: 50000,

  /** Daily token limit per role. guest=0 (cannot translate); admin=-1 (unlimited). */
  ROLE_DAILY_LIMITS: {
    guest: 0,
    author: 50000,
    author_plus: 100000,
    super_author: 200000,
    admin: -1, // unlimited
  } as const satisfies Record<UserRole, number>,

  /** Sentinel for unlimited daily limit (admin). */
  UNLIMITED_LIMIT: -1 as const,

  /** Warning threshold (percentage of limit) */
  WARNING_THRESHOLD: 0.8, // Warn at 80% usage

  /** Block threshold (percentage of limit) */
  BLOCK_THRESHOLD: 1.0, // Block at 100% usage

  /** Token calculation coefficients (per 10,000 characters) */
  TOKENS_PER_10K_CHARS: {
    analysis: 5000, // ~5000 tokens per 10k chars observed in practice
    translation: 10000,
    editing: 13000,
    total: 28000,
  },

  /** Reset time (UTC) */
  RESET_TIME: '00:00:00',
  RESET_TIMEZONE: 'UTC',
} as const;

/**
 * Get daily token limit for the given role.
 * Guest = 0; admin = UNLIMITED_LIMIT (-1); others use ROLE_DAILY_LIMITS.
 */
export function getTokenLimitForRole(role: UserRole): number {
  return TOKEN_LIMITS.ROLE_DAILY_LIMITS[role];
}

/** True when limit is unlimited (e.g. admin). */
export function isUnlimitedTokenLimit(limit: number): boolean {
  return limit === TOKEN_LIMITS.UNLIMITED_LIMIT || limit < 0;
}

/**
 * Translation options for token estimation (legacy: skip flags)
 */
export interface TranslationOptions {
  skipAnalysis?: boolean;
  skipEditing?: boolean;
}

/** Stages for translation pipeline; used for token estimate and API. */
export type TranslationStageKind = 'analysis' | 'translation' | 'editing';
export type TranslationStages = TranslationStageKind[] | 'all';

/**
 * Estimate tokens for the given stages.
 * Array: sum coefficients for selected stages; 'all': sum of all three.
 */
export function estimateTokensForStages(
  textLength: number,
  stages: TranslationStages = 'all'
): number {
  const charsIn10K = textLength / 10000;
  const { analysis, translation, editing } = TOKEN_LIMITS.TOKENS_PER_10K_CHARS;
  if (stages === 'all') {
    return Math.ceil((analysis + translation + editing) * charsIn10K);
  }
  let sum = 0;
  if (stages.includes('analysis')) sum += analysis;
  if (stages.includes('translation')) sum += translation;
  if (stages.includes('editing')) sum += editing;
  return Math.ceil(sum * charsIn10K);
}

/**
 * Estimate tokens needed for translation based on text length
 *
 * @param textLength - Length of text in characters
 * @param options - Translation options (which stages to include)
 * @returns Estimated number of tokens
 */
export function estimateTokensForTranslation(
  textLength: number,
  options: TranslationOptions = {}
): number {
  const charsIn10K = textLength / 10000;
  let tokens = 0;

  // Analysis stage tokens
  if (!options.skipAnalysis) {
    tokens += TOKEN_LIMITS.TOKENS_PER_10K_CHARS.analysis * charsIn10K;
  }

  // Translation stage tokens (always included)
  tokens += TOKEN_LIMITS.TOKENS_PER_10K_CHARS.translation * charsIn10K;

  // Editing stage tokens
  if (!options.skipEditing) {
    tokens += TOKEN_LIMITS.TOKENS_PER_10K_CHARS.editing * charsIn10K;
  }

  // Round up to be conservative
  return Math.ceil(tokens);
}

/**
 * Calculate tokens by stage for given text length
 */
export function estimateTokensByStage(
  textLength: number,
  options: TranslationOptions = {}
): {
  analysis?: number;
  translation: number;
  editing?: number;
  total: number;
} {
  const charsIn10K = textLength / 10000;
  
  const translation = Math.ceil(TOKEN_LIMITS.TOKENS_PER_10K_CHARS.translation * charsIn10K);
  let analysis: number | undefined;
  let editing: number | undefined;
  
  if (!options.skipAnalysis) {
    analysis = Math.ceil(TOKEN_LIMITS.TOKENS_PER_10K_CHARS.analysis * charsIn10K);
  }
  
  if (!options.skipEditing) {
    editing = Math.ceil(TOKEN_LIMITS.TOKENS_PER_10K_CHARS.editing * charsIn10K);
  }
  
  const total = (analysis || 0) + translation + (editing || 0);
  
  const result: {
    analysis?: number;
    translation: number;
    editing?: number;
    total: number;
  } = {
    translation,
    total,
  };
  
  if (analysis !== undefined) {
    result.analysis = analysis;
  }
  
  if (editing !== undefined) {
    result.editing = editing;
  }
  
  return result;
}
