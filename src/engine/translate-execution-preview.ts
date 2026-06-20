/**
 * Live preview of translate execution plan (Prompt Lab + future prod hints).
 */

import type { Language } from './types/common.js';
import { resolveTranslateOptimizationFlags , resolveTranslateChunkSize } from './translate-optimization.js';
import {
  resolveTranslateChunkingMode,
  type TranslateChunkingMode,
} from './translate-chunking-policy.js';
import {
  defaultPresetForModel,
  resolvePresetToTranslateOptions,
  type TranslateQualityPreset,
} from '../shared/translate-quality-presets.js';
import { estimateTokensHeuristic } from './utils/token-estimate.js';
import type { TranslateOptimizationFlags } from './translate-optimization.js';

export interface TranslateExecutionPreviewInput {
  preset: TranslateQualityPreset;
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
  preset: TranslateQualityPreset;
  modelId: string;
  chunkingMode: TranslateChunkingMode;
  chunkingReason: string;
  estimatedChunks: number;
  effectiveChunkSize: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
  flags: TranslateOptimizationFlags;
  hints: string[];
}

function estimateChunkCountHeuristic(sourceText: string, chunkSize: number): number {
  const tokens = estimateTokensHeuristic(sourceText);
  if (tokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokens / chunkSize));
}

export function buildTranslateExecutionPreview(
  input: TranslateExecutionPreviewInput
): TranslateExecutionPreview {
  const presetOptions = resolvePresetToTranslateOptions(input.preset);
  const optimization = resolveTranslateOptimizationFlags({
    enableTranslateFewShot: presetOptions.enableTranslateFewShot,
    enableTranslateCoT: presetOptions.enableTranslateCoT,
    translateLeadingContextParagraphs: presetOptions.translateLeadingContextParagraphs,
    enableTranslateStructuredCoT: input.enableTranslateStructuredCoT,
    modelId: input.modelId,
    chunkSizeOverride: input.chunkSizeOverride,
    includeGlossaryInTranslation: input.includeGlossary !== false,
  });

  const chunking = resolveTranslateChunkingMode({
    sourceText: input.sourceText,
    modelId: input.modelId,
    optimization,
    targetLanguage: input.targetLanguage,
    glossaryText: input.glossaryText,
    contextText: input.contextText,
    forceChunked: input.forceChunked,
  });

  const effectiveChunkSize = resolveTranslateChunkSize({
    chunkSizeOverride: input.chunkSizeOverride,
    modelId: input.modelId,
    includeGlossaryInTranslation: input.includeGlossary !== false,
  });

  const estimatedChunks =
    chunking.mode === 'single_shot'
      ? 1
      : estimateChunkCountHeuristic(input.sourceText, effectiveChunkSize);

  const hints: string[] = [];
  const sourceChars = input.sourceText.length;
  const is41 = input.modelId.toLowerCase().includes('gpt-4.1-mini');
  if (input.preset === 'enhanced' && is41 && chunking.mode === 'chunked' && sourceChars >= 12_000) {
    hints.push(
      'Chapter is long for gpt-4.1-mini Enhanced (chunked). Try gpt-5.4-mini for single-shot up to ~25k chars.'
    );
  }
  if (input.preset === 'enhanced' && chunking.mode === 'single_shot') {
    hints.push('Full chapter in one API request — leading context not used.');
  }

  return {
    preset: input.preset,
    modelId: input.modelId,
    chunkingMode: chunking.mode,
    chunkingReason: chunking.reason,
    estimatedChunks,
    effectiveChunkSize,
    estimatedInputTokens: chunking.estimatedInputTokens,
    estimatedOutputTokens: chunking.estimatedOutputTokens,
    effectiveMaxTokens: chunking.effectiveMaxTokens,
    flags: optimization,
    hints,
  };
}

export { defaultPresetForModel };
