/**
 * Resolve edit chunking mode: single-shot vs token chunking.
 */

import { resolveModelMaxOutputTokens } from './translate-chunking-policy.js';
import { estimateTokensHeuristic } from './utils/token-estimate.js';
import {
  EDIT_AUTO_CHUNK_TOKEN_THRESHOLD,
  EDIT_FAST_CHUNK_SIZE,
  EDIT_STANDARD_CHUNK_SIZE,
  resolvePresetToEditOptions,
  type EditQualityPreset,
} from '../shared/edit-quality-presets.js';

export type EditChunkingMode = 'single_shot' | 'chunked';

export interface EditChunkingResolution {
  mode: EditChunkingMode;
  reason: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
  effectiveChunkSize: number;
}

const PROMPT_OVERHEAD_TOKENS = 2500;
const INPUT_MARGIN_TOKENS = 512;
const INPUT_BUDGET_CAP = 200_000;

/** Lab edit max output tokens (matches runner buildLabApiRequestParams). */
export const LAB_EDIT_MAX_OUTPUT_TOKENS = 8192;

function estimateTokens(text: string): number {
  return estimateTokensHeuristic(text);
}

export function estimateEditTokenBudgets(input: {
  translatedText: string;
  glossaryText?: string;
  castText?: string;
}): { inputTokens: number; outputTokens: number; draftTokens: number } {
  const draftTokens = estimateTokens(input.translatedText);
  const glossaryTokens = input.glossaryText ? estimateTokens(input.glossaryText) : 0;
  const castTokens = input.castText ? estimateTokens(input.castText) : 0;

  const inputTokens =
    draftTokens + glossaryTokens + castTokens + PROMPT_OVERHEAD_TOKENS + INPUT_MARGIN_TOKENS;
  const outputTokens = draftTokens;

  return { inputTokens, outputTokens, draftTokens };
}

export function resolveEditChunkSize(input: {
  chunkSizeOverride?: number;
  preset: EditQualityPreset;
  includeGlossary?: boolean;
}): number {
  if (input.chunkSizeOverride !== undefined && input.chunkSizeOverride > 0) {
    return input.chunkSizeOverride;
  }
  const presetOpts = resolvePresetToEditOptions(input.preset);
  if (presetOpts.forceChunked && presetOpts.defaultChunkSize === EDIT_FAST_CHUNK_SIZE) {
    return EDIT_FAST_CHUNK_SIZE;
  }
  if (input.includeGlossary === false) {
    return 3500;
  }
  return EDIT_STANDARD_CHUNK_SIZE;
}

export function canSingleShotEdit(input: {
  translatedText: string;
  modelId: string;
  glossaryText?: string;
  castText?: string;
  maxTokensOverride?: number;
}): boolean {
  const { inputTokens, outputTokens } = estimateEditTokenBudgets(input);
  const maxOutputCap = input.maxTokensOverride ?? LAB_EDIT_MAX_OUTPUT_TOKENS;
  const modelMax = resolveModelMaxOutputTokens(input.modelId);
  const effectiveCap = Math.min(maxOutputCap, modelMax);

  return inputTokens < INPUT_BUDGET_CAP && outputTokens < effectiveCap * 0.9;
}

export interface ResolveEditChunkingModeInput {
  translatedText: string;
  modelId: string;
  preset: EditQualityPreset;
  glossaryText?: string;
  castText?: string;
  forceChunked?: boolean;
  forceSingleShot?: boolean;
  chunkSizeOverride?: number;
  includeGlossary?: boolean;
}

export function resolveEditChunkingMode(
  input: ResolveEditChunkingModeInput
): EditChunkingResolution {
  const { inputTokens, outputTokens, draftTokens } = estimateEditTokenBudgets({
    translatedText: input.translatedText,
    glossaryText: input.glossaryText,
    castText: input.castText,
  });

  const presetOpts = resolvePresetToEditOptions(input.preset);
  const effectiveChunkSize = resolveEditChunkSize({
    chunkSizeOverride: input.chunkSizeOverride,
    preset: input.preset,
    includeGlossary: input.includeGlossary,
  });

  const modelMax = resolveModelMaxOutputTokens(input.modelId);
  const effectiveMaxTokens = Math.min(
    modelMax,
    LAB_EDIT_MAX_OUTPUT_TOKENS,
    Math.max(LAB_EDIT_MAX_OUTPUT_TOKENS, Math.ceil(outputTokens * 1.1))
  );

  const forceChunked = input.forceChunked === true || presetOpts.forceChunked;
  const wantsSingleShot = input.forceSingleShot ?? presetOpts.forceSingleShot;

  if (forceChunked) {
    return {
      mode: 'chunked',
      reason: input.forceChunked ? 'force_chunked' : 'preset_fast',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens: LAB_EDIT_MAX_OUTPUT_TOKENS,
      effectiveChunkSize,
    };
  }

  if (wantsSingleShot && canSingleShotEdit(input)) {
    return {
      mode: 'single_shot',
      reason: 'draft_fits_budget',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens,
      effectiveChunkSize,
    };
  }

  if (wantsSingleShot && !canSingleShotEdit(input)) {
    return {
      mode: 'chunked',
      reason: 'draft_exceeds_output_budget',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens: LAB_EDIT_MAX_OUTPUT_TOKENS,
      effectiveChunkSize,
    };
  }

  if (draftTokens > EDIT_AUTO_CHUNK_TOKEN_THRESHOLD) {
    return {
      mode: 'chunked',
      reason: 'draft_exceeds_auto_threshold',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens: LAB_EDIT_MAX_OUTPUT_TOKENS,
      effectiveChunkSize,
    };
  }

  return {
    mode: 'single_shot',
    reason: 'short_draft_direct',
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    effectiveMaxTokens,
    effectiveChunkSize,
  };
}
