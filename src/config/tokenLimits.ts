/**
 * Token Limits Configuration
 * 
 * Defines daily token limits and calculation coefficients for translation
 */

export const TOKEN_LIMITS = {
  /** Daily token limit per user */
  DAILY_LIMIT: 50000,
  
  /** Warning threshold (percentage of limit) */
  WARNING_THRESHOLD: 0.8, // Warn at 80% usage
  
  /** Block threshold (percentage of limit) */
  BLOCK_THRESHOLD: 1.0, // Block at 100% usage
  
  /** Token calculation coefficients (per 10,000 characters) */
  TOKENS_PER_10K_CHARS: {
    analysis: 2000,
    translation: 10000,
    editing: 13000,
    total: 25000,
  },
  
  /** Reset time (UTC) */
  RESET_TIME: '00:00:00',
  RESET_TIMEZONE: 'UTC',
} as const;

/**
 * Translation options for token estimation
 */
export interface TranslationOptions {
  skipAnalysis?: boolean;
  skipEditing?: boolean;
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
