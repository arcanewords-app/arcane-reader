/**
 * Live preview of translate execution plan (Prompt Lab + future prod hints).
 */

import type { Language } from './types/common.js';
import {
  resolveTranslateOptimizationFlags,
  resolveTranslateChunkSize,
} from './translate-optimization.js';
import {
  resolveTranslateChunkingMode,
  type TranslateChunkingMode,
} from './translate-chunking-policy.js';
import {
  defaultExecutionModeForModel,
  resolveExecutionModeToTranslateOptions,
  type TranslateExecutionMode,
} from '../shared/translate-execution-modes.js';
import {
  ONE_SHOT_FALLBACK_CHUNK_SIZE,
  DEFAULT_TRANSLATION_CHUNK_SIZE,
  resolveChunkSizeTier,
} from '../shared/translationChunkPresets.js';
import { chunkText } from './utils/chunker-core.js';
import type { TranslateOptimizationFlags } from './translate-optimization.js';

export interface TranslateExecutionPreviewInput {
  executionMode: TranslateExecutionMode;
  modelId: string;
  sourceText: string;
  targetLanguage?: Language;
  includeGlossary?: boolean;
  glossaryText?: string;
  contextText?: string;
  chunkSizeOverride?: number;
  forceChunked?: boolean;
  enableTranslateStructuredCoT?: boolean;
}

export interface TranslateExecutionPreview {
  executionMode: TranslateExecutionMode;
  modelId: string;
  chunkingMode: TranslateChunkingMode;
  chunkingReason: string;
  chunkSizeTier: 'single' | 'large' | 'standard';
  estimatedChunks: number;
  effectiveChunkSize: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
  flags: TranslateOptimizationFlags;
  hints: string[];
}

function estimateChunkCount(
  sourceText: string,
  chunkingMode: TranslateChunkingMode,
  effectiveChunkSize: number
): number {
  if (chunkingMode === 'single_shot') return 1;
  const trimmed = sourceText.trim();
  if (!trimmed) return 0;
  return chunkText(trimmed, {
    maxTokens: effectiveChunkSize,
    preserveParagraphs: true,
    neverSplitParagraphs: true,
  }).length;
}

export function buildTranslateExecutionPreview(
  input: TranslateExecutionPreviewInput
): TranslateExecutionPreview {
  const modeOptions = resolveExecutionModeToTranslateOptions(input.executionMode);
  const optimization = resolveTranslateOptimizationFlags({
    enableTranslateFewShot: modeOptions.enableTranslateFewShot,
    enableTranslateCoT: modeOptions.enableTranslateCoT,
    translateLeadingContextParagraphs: modeOptions.translateLeadingContextParagraphs,
    enableTranslateStructuredCoT: input.enableTranslateStructuredCoT,
    modelId: input.modelId,
    chunkSizeOverride: input.chunkSizeOverride,
    includeGlossaryInTranslation: input.includeGlossary !== false,
    executionMode: input.executionMode,
  });

  const chunking = resolveTranslateChunkingMode({
    sourceText: input.sourceText,
    modelId: input.modelId,
    optimization,
    executionMode: input.executionMode,
    targetLanguage: input.targetLanguage,
    glossaryText: input.glossaryText,
    contextText: input.contextText,
    forceChunked: input.forceChunked,
  });

  const effectiveChunkSize = resolveTranslateChunkSize({
    chunkSizeOverride: input.chunkSizeOverride,
    modelId: input.modelId,
    includeGlossaryInTranslation: input.includeGlossary !== false,
    executionMode: input.executionMode,
    chunkingMode: chunking.mode,
  });

  const chunkSizeTier = resolveChunkSizeTier(input.executionMode, chunking.mode);

  const estimatedChunks = estimateChunkCount(input.sourceText, chunking.mode, effectiveChunkSize);

  const hints: string[] = [];
  const sourceChars = input.sourceText.length;
  const is41 = input.modelId.toLowerCase().includes('gpt-4.1-mini');
  if (
    input.executionMode === 'one_shot' &&
    is41 &&
    chunking.mode === 'chunked' &&
    sourceChars >= 12_000
  ) {
    hints.push(
      'Chapter is long for gpt-4.1-mini One-shot (large chunks). Try gpt-5.4-mini for single-shot up to ~25k chars.'
    );
  }
  if (input.executionMode === 'one_shot' && chunking.mode === 'single_shot') {
    hints.push('Full chapter in one API request — leading context not used.');
  }
  if (input.executionMode === 'one_shot' && chunking.reason === 'one_shot_large_chunks') {
    hints.push(
      `Chapter exceeds one-shot budget → large chunks (${ONE_SHOT_FALLBACK_CHUNK_SIZE} tok).`
    );
  }
  if (input.executionMode === 'chunked') {
    hints.push(`Standard chunks (${DEFAULT_TRANSLATION_CHUNK_SIZE} tok) — production default.`);
  }

  return {
    executionMode: input.executionMode,
    modelId: input.modelId,
    chunkingMode: chunking.mode,
    chunkingReason: chunking.reason,
    chunkSizeTier,
    estimatedChunks,
    effectiveChunkSize,
    estimatedInputTokens: chunking.estimatedInputTokens,
    estimatedOutputTokens: chunking.estimatedOutputTokens,
    effectiveMaxTokens: chunking.effectiveMaxTokens,
    flags: optimization,
    hints,
  };
}

export { defaultExecutionModeForModel as defaultPresetForModel };
