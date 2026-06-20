/**
 * Resolve edit chunking mode: single-shot vs token chunking.
 */

import { resolveModelMaxOutputTokens } from './translate-chunking-policy.js';
import { estimateTokensHeuristic } from './utils/token-estimate.js';
import {
  EDIT_AUTO_CHUNK_TOKEN_THRESHOLD,
  EDIT_MINIMAL_CHUNK_SIZE,
  EDIT_STANDARD_CHUNK_SIZE,
  ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE,
  resolveExecutionModeToEditOptions,
  type EditExecutionMode,
} from '../shared/edit-execution-modes.js';

export type EditChunkingMode = 'single_shot' | 'chunked';

export interface EditChunkingResolution {
  mode: EditChunkingMode;
  reason: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
  effectiveChunkSize: number;
  chunkSizeTier: 'single' | 'large' | 'standard';
}

const PROMPT_OVERHEAD_TOKENS = 2500;
const INPUT_MARGIN_TOKENS = 512;
const INPUT_BUDGET_CAP = 200_000;

/** Lab edit max output tokens (matches runner buildLabApiRequestParams). */
export const LAB_EDIT_MAX_OUTPUT_TOKENS = 8192;

function estimateTokens(text: string): number {
  return estimateTokensHeuristic(text);
}

function resolveEditChunkSizeTier(
  executionMode: EditExecutionMode,
  chunkingMode: EditChunkingMode
): 'single' | 'large' | 'standard' {
  if (chunkingMode === 'single_shot') return 'single';
  if (executionMode === 'one_shot') return 'large';
  return 'standard';
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
  executionMode: EditExecutionMode;
  chunkingMode: EditChunkingMode;
  includeGlossary?: boolean;
  minimalChunkOverride?: boolean;
}): number {
  if (input.chunkSizeOverride !== undefined && input.chunkSizeOverride > 0) {
    return input.chunkSizeOverride;
  }
  if (input.minimalChunkOverride) {
    return EDIT_MINIMAL_CHUNK_SIZE;
  }
  if (input.executionMode === 'one_shot' && input.chunkingMode === 'chunked') {
    return ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE;
  }
  if (input.includeGlossary === false) {
    return ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE;
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
  executionMode: EditExecutionMode;
  glossaryText?: string;
  castText?: string;
  forceChunked?: boolean;
  forceSingleShot?: boolean;
  chunkSizeOverride?: number;
  includeGlossary?: boolean;
  minimalChunkOverride?: boolean;
}

export function resolveEditChunkingMode(
  input: ResolveEditChunkingModeInput
): EditChunkingResolution {
  const { inputTokens, outputTokens, draftTokens } = estimateEditTokenBudgets({
    translatedText: input.translatedText,
    glossaryText: input.glossaryText,
    castText: input.castText,
  });

  const presetOpts = resolveExecutionModeToEditOptions(input.executionMode);
  const forceChunked = input.forceChunked === true;
  const wantsSingleShot = input.forceSingleShot ?? presetOpts.forceSingleShot;

  const modelMax = resolveModelMaxOutputTokens(input.modelId);
  const effectiveMaxTokens = Math.min(
    modelMax,
    LAB_EDIT_MAX_OUTPUT_TOKENS,
    Math.max(LAB_EDIT_MAX_OUTPUT_TOKENS, Math.ceil(outputTokens * 1.1))
  );

  let mode: EditChunkingMode;
  let reason: string;

  if (forceChunked) {
    mode = 'chunked';
    reason = 'force_chunked';
  } else if (input.executionMode === 'chunked') {
    if (draftTokens > EDIT_AUTO_CHUNK_TOKEN_THRESHOLD) {
      mode = 'chunked';
      reason = 'chunked_standard';
    } else {
      mode = 'single_shot';
      reason = 'short_draft_direct';
    }
  } else if (wantsSingleShot && canSingleShotEdit(input)) {
    mode = 'single_shot';
    reason = 'one_shot_fits_budget';
  } else if (wantsSingleShot && !canSingleShotEdit(input)) {
    mode = 'chunked';
    reason = 'one_shot_large_chunks';
  } else if (draftTokens > EDIT_AUTO_CHUNK_TOKEN_THRESHOLD) {
    mode = 'chunked';
    reason = 'chunked_standard';
  } else {
    mode = 'single_shot';
    reason = 'short_draft_direct';
  }

  const effectiveChunkSize = resolveEditChunkSize({
    chunkSizeOverride: input.chunkSizeOverride,
    executionMode: input.executionMode,
    chunkingMode: mode,
    includeGlossary: input.includeGlossary,
    minimalChunkOverride: input.minimalChunkOverride,
  });

  return {
    mode,
    reason,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    effectiveMaxTokens: mode === 'single_shot' ? effectiveMaxTokens : LAB_EDIT_MAX_OUTPUT_TOKENS,
    effectiveChunkSize,
    chunkSizeTier: resolveEditChunkSizeTier(input.executionMode, mode),
  };
}
