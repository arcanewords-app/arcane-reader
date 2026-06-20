/**
 * Resolve translate chunking mode: single-shot vs token chunking.
 *
 * Single-shot is preferred when CoT or leading context is enabled and the chapter
 * fits within model input/output budgets — avoids merge bloat from repeated full-chapter JSON.
 */

import type { Language } from './types/common.js';
import { estimateTokensHeuristic } from './utils/token-estimate.js';
import {
  resolveTranslateLlmDefaults,
  resolveModelCapabilities,
} from '../shared/openaiModelAdapter.js';
import type { TranslateOptimizationFlags } from './translate-optimization.js';

export type TranslateChunkingMode = 'single_shot' | 'chunked';

export interface TranslateChunkingResolution {
  mode: TranslateChunkingMode;
  reason: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
}

const INPUT_MARGIN_TOKENS = 512;
const INPUT_BUDGET_CAP = 200_000;
const COT_OVERHEAD_TOKENS = 2000;
const PROMPT_OVERHEAD_TOKENS = 2500;

function estimateTokens(text: string): number {
  return estimateTokensHeuristic(text);
}

/** Hard API output ceilings per model family (cannot be overridden via API). */
export function resolveModelMaxOutputTokens(modelId: string): number {
  const caps = resolveModelCapabilities(modelId);
  if (caps.isReasoningModel) return 100_000;
  if (caps.family === 'gpt-4.1' || caps.family === 'gpt-4o' || caps.family === 'gpt-5') {
    return 32_768;
  }
  return 16_384;
}

function expansionFactor(targetLanguage?: Language): number {
  if (targetLanguage === 'ru' || targetLanguage === 'be') return 1.4;
  if (targetLanguage === 'zh' || targetLanguage === 'ko') return 1.0;
  return 1.2;
}

export interface ResolveTranslateChunkingModeInput {
  sourceText: string;
  modelId: string;
  optimization: TranslateOptimizationFlags;
  targetLanguage?: Language;
  glossaryText?: string;
  contextText?: string;
  forceChunked?: boolean;
  maxTokensOverride?: number;
}

export function estimateTranslateTokenBudgets(input: {
  sourceText: string;
  optimization: TranslateOptimizationFlags;
  targetLanguage?: Language;
  glossaryText?: string;
  contextText?: string;
}): { inputTokens: number; outputTokens: number } {
  const sourceTokens = estimateTokens(input.sourceText);
  const glossaryTokens = input.glossaryText ? estimateTokens(input.glossaryText) : 0;
  const contextTokens = input.contextText ? estimateTokens(input.contextText) : 0;
  const cotOverhead = input.optimization.enableCoT ? COT_OVERHEAD_TOKENS : 0;

  const inputTokens =
    sourceTokens + glossaryTokens + contextTokens + PROMPT_OVERHEAD_TOKENS + INPUT_MARGIN_TOKENS;

  const outputTokens =
    Math.ceil(sourceTokens * expansionFactor(input.targetLanguage)) + cotOverhead;

  return { inputTokens, outputTokens };
}

export function canSingleShotTranslate(input: {
  sourceText: string;
  modelId: string;
  optimization: TranslateOptimizationFlags;
  targetLanguage?: Language;
  glossaryText?: string;
  contextText?: string;
  maxTokensOverride?: number;
}): boolean {
  const { inputTokens, outputTokens } = estimateTranslateTokenBudgets(input);
  const llmDefaults = resolveTranslateLlmDefaults(
    input.modelId,
    input.optimization.enableStructuredCoT
  );
  const maxOutputCap = input.maxTokensOverride ?? llmDefaults.maxTokens;
  const modelMax = resolveModelMaxOutputTokens(input.modelId);
  const effectiveCap = Math.min(maxOutputCap, modelMax);

  return inputTokens < INPUT_BUDGET_CAP && outputTokens < effectiveCap * 0.9;
}

export function resolveTranslateChunkingMode(
  input: ResolveTranslateChunkingModeInput
): TranslateChunkingResolution {
  const { inputTokens, outputTokens } = estimateTranslateTokenBudgets(input);
  const llmDefaults = resolveTranslateLlmDefaults(
    input.modelId,
    input.optimization.enableStructuredCoT
  );
  const modelMax = resolveModelMaxOutputTokens(input.modelId);
  const baseMax = input.maxTokensOverride ?? llmDefaults.maxTokens;
  const effectiveMaxTokens = Math.min(modelMax, Math.max(baseMax, Math.ceil(outputTokens * 1.15)));

  if (input.forceChunked) {
    return {
      mode: 'chunked',
      reason: 'force_chunked',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens: baseMax,
    };
  }

  const wantsContextualMode =
    input.optimization.enableCoT || input.optimization.leadingContextParagraphs > 0;

  if (wantsContextualMode && canSingleShotTranslate(input)) {
    return {
      mode: 'single_shot',
      reason: 'cot_or_leading_context_fits_budget',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens,
    };
  }

  if (wantsContextualMode && !canSingleShotTranslate(input)) {
    return {
      mode: 'chunked',
      reason: 'cot_or_leading_context_exceeds_output_budget',
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      effectiveMaxTokens: baseMax,
    };
  }

  return {
    mode: 'chunked',
    reason: 'default_chunked',
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    effectiveMaxTokens: baseMax,
  };
}
