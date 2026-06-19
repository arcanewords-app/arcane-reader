/**
 * Resolve translate optimization flags (few-shot, CoT, leading context, chunk size).
 */

import type { PipelineOptions } from './types/pipeline.js';
import {
  resolveTranslationChunkSize,
  MINI_MODEL_TRANSLATION_CHUNK_SIZE,
} from '../shared/translationChunkPresets.js';

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
}

export function resolveTranslateOptimizationFlags(
  input: ResolveTranslateOptimizationInput
): TranslateOptimizationFlags {
  const profile =
    input.miniModelProfile === true || input.pipelineOptions?.miniModelTranslationProfile === true;

  const enableFewShot =
    input.enableTranslateFewShot ?? input.pipelineOptions?.enableTranslateFewShot ?? profile;

  const enableCoT = input.enableTranslateCoT ?? input.pipelineOptions?.enableTranslateCoT ?? false;

  const enableStructuredCoT =
    input.enableTranslateStructuredCoT ??
    input.pipelineOptions?.enableTranslateStructuredCoT ??
    enableCoT;

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
  });
}
