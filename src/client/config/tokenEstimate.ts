/**
 * Client-side token estimation for translation.
 * Keep coefficients in sync with server config/tokenLimits.ts (TOKENS_PER_10K_CHARS).
 */

export const TOKENS_PER_10K_CHARS = {
  analysis: 5000, // ~5000 tokens per 10k chars observed in practice
  translation: 10000,
  editing: 13000,
} as const;

export const TOKENS_PER_TITLE_BATCH = 500;
export const TITLE_BATCH_SIZE = 25;

export const WARNING_THRESHOLD = 0.8; // 80%

export type TranslationStageKind = 'analysis' | 'translation' | 'editing';
export type TranslationStages = TranslationStageKind[] | 'all';

export interface TokenEstimateOptions {
  skipAnalysis?: boolean;
  skipEditing?: boolean;
}

/**
 * Estimate tokens for the given stages.
 * Array: sum coefficients for selected stages; 'all': sum of all three.
 */
export function estimateTokensForStages(
  textLength: number,
  stages: TranslationStages = 'all'
): number {
  const charsIn10K = textLength / 10000;
  const { analysis, translation, editing } = TOKENS_PER_10K_CHARS;
  if (stages === 'all') {
    return Math.ceil((analysis + translation + editing) * charsIn10K);
  }
  let sum = 0;
  if (stages.includes('analysis')) sum += analysis;
  if (stages.includes('translation')) sum += translation;
  if (stages.includes('editing')) sum += editing;
  return Math.ceil(sum * charsIn10K);
}

/** Estimate tokens for batch chapter title translation. */
export function estimateTokensForChapterTitles(chapterCount: number): number {
  if (chapterCount <= 0) return 0;
  const batches = Math.ceil(chapterCount / TITLE_BATCH_SIZE);
  return batches * TOKENS_PER_TITLE_BATCH;
}

/**
 * Estimate tokens needed for translation based on text length (legacy: skip flags).
 * Same formula as server estimateTokensForTranslation.
 */
export function estimateTokensForTranslation(
  textLength: number,
  options: TokenEstimateOptions = {}
): number {
  const charsIn10K = textLength / 10000;
  let tokens = 0;
  if (!options.skipAnalysis) {
    tokens += TOKENS_PER_10K_CHARS.analysis * charsIn10K;
  }
  tokens += TOKENS_PER_10K_CHARS.translation * charsIn10K;
  if (!options.skipEditing) {
    tokens += TOKENS_PER_10K_CHARS.editing * charsIn10K;
  }
  return Math.ceil(tokens);
}
