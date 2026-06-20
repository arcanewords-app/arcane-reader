/**
 * Resolve translate optimization flags (few-shot, CoT, leading context, chunk size).
 */

import type { PipelineOptions } from './types/pipeline.js';
import {
  resolveTranslationChunkSize,
  MINI_MODEL_TRANSLATION_CHUNK_SIZE,
} from '../shared/translationChunkPresets.js';
import type { TranslateExecutionMode } from '../shared/translate-execution-modes.js';
import type { TranslateChunkingMode } from './translate-chunking-policy.js';
import { isReasoningModel } from '../shared/openaiModelAdapter.js';

export interface TranslateOptimizationFlags {
  enableFewShot: boolean;
  enableCoT: boolean;
  enableStructuredCoT: boolean;
  leadingContextParagraphs: number;
}

export interface ResolveTranslateOptimizationInput {
  pipelineOptions?: PipelineOptions;
  miniModelProfile?: boolean;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  modelId?: string;
  chunkSizeOverride?: number;
  includeGlossaryInTranslation?: boolean;
  executionMode?: TranslateExecutionMode;
  chunkingMode?: TranslateChunkingMode;
}

export function resolveTranslateOptimizationFlags(
  input: ResolveTranslateOptimizationInput
): TranslateOptimizationFlags {
  const profile =
    input.miniModelProfile === true || input.pipelineOptions?.miniModelTranslationProfile === true;

  const enableFewShot =
    input.enableTranslateFewShot ?? input.pipelineOptions?.enableTranslateFewShot ?? profile;

  const enableCoT = input.enableTranslateCoT ?? input.pipelineOptions?.enableTranslateCoT ?? false;

  const explicitStructured =
    input.enableTranslateStructuredCoT ?? input.pipelineOptions?.enableTranslateStructuredCoT;

  let enableStructuredCoT = explicitStructured === true;
  if (explicitStructured === undefined && input.modelId && isReasoningModel(input.modelId)) {
    enableStructuredCoT = false;
  }

  let leadingContextParagraphs =
    input.translateLeadingContextParagraphs ??
    input.pipelineOptions?.translateLeadingContextParagraphs ??
    0;
  if (profile && leadingContextParagraphs === 0) {
    leadingContextParagraphs = 2;
  }

  return {
    enableFewShot: Boolean(enableFewShot),
    enableCoT: Boolean(enableCoT),
    enableStructuredCoT: Boolean(enableStructuredCoT),
    leadingContextParagraphs: Math.max(0, Math.min(leadingContextParagraphs, 4)),
  };
}

export function resolveTranslateChunkSize(input: ResolveTranslateOptimizationInput): number {
  const profile =
    input.miniModelProfile === true || input.pipelineOptions?.miniModelTranslationProfile === true;
  if (profile && input.chunkSizeOverride == null && input.pipelineOptions?.chunkSize == null) {
    return MINI_MODEL_TRANSLATION_CHUNK_SIZE;
  }
  return resolveTranslationChunkSize({
    override: input.chunkSizeOverride ?? input.pipelineOptions?.chunkSize,
    modelId: input.modelId,
    includeGlossaryInTranslation: input.includeGlossaryInTranslation,
    miniModelProfile: profile,
    executionMode: input.executionMode,
    chunkingMode: input.chunkingMode,
  });
}
