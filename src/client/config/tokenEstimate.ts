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

export {
  estimateChapterTranslationTokens,
  estimateBatchTranslationTokens,
  TOKENS_PER_10K_CHARS as SHARED_TOKENS_PER_10K_CHARS,
} from '../../shared/translationTokenEstimate.js';

import {
  estimateChapterTranslationTokens,
  estimateBatchTranslationTokens,
} from '../../shared/translationTokenEstimate.js';
import { resolveChapterSummarySourceTextLength } from '../../shared/chapterSourceText.js';
import type { Chapter, Project, TranslationStages } from '../types';

/** Estimate tokens for a chapter using project glossary and settings. */
export function estimateChapterTranslationTokensForProject(
  project: Pick<Project, 'glossary' | 'settings' | 'targetLanguage'>,
  chapter: Pick<Chapter, 'number'>,
  input: {
    textLength: number;
    stages?: TranslationStages;
    translateChapterTitles?: boolean;
  }
): number {
  return estimateChapterTranslationTokens({
    textLength: input.textLength,
    stages: input.stages,
    translateChapterTitles: input.translateChapterTitles,
    glossary: project.glossary,
    chapterNumber: chapter.number,
    settings: project.settings,
    targetLanguage: project.targetLanguage,
  });
}

/** Batch estimate for selected chapters (summary or full chapter objects). */
export function estimateBatchTranslationTokensForProject(
  project: Pick<Project, 'glossary' | 'settings' | 'targetLanguage'>,
  chapters: Array<{
    number: number;
    originalText?: string;
    paragraphs?: Array<{ originalText?: string }>;
    paragraphCount?: number;
  }>,
  options: {
    stages?: TranslationStages;
    translateChapterTitles?: boolean;
  }
): number {
  const chapterInputs = chapters.map((ch) => ({
    textLength: resolveChapterSummarySourceTextLength(ch),
    chapterNumber: ch.number,
  }));
  return estimateBatchTranslationTokens(chapterInputs, {
    stages: options.stages,
    translateChapterTitles: options.translateChapterTitles,
    glossary: project.glossary,
    settings: project.settings,
    targetLanguage: project.targetLanguage,
  });
}
