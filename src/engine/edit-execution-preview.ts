/**
 * Live preview of edit execution plan (Prompt Lab).
 */

import { resolveEditChunkingMode, type EditChunkingMode } from './edit-chunking-policy.js';
import {
  defaultEditPresetForModel,
  resolvePresetToEditOptions,
  type EditQualityPreset,
} from '../shared/edit-quality-presets.js';
import type { EditingFocus, EditingStylePreset } from './prompts/system/editor.js';
import { estimateTokensHeuristic } from './utils/token-estimate.js';

export interface EditExecutionPreviewInput {
  preset: EditQualityPreset;
  modelId: string;
  translatedText: string;
  glossaryText?: string;
  castText?: string;
  includeGlossary?: boolean;
  chunkSizeOverride?: number;
  forceChunked?: boolean;
  stylePresetOverride?: EditingStylePreset;
  focusOverride?: EditingFocus;
}

export interface EditExecutionPreview {
  preset: EditQualityPreset;
  modelId: string;
  chunkingMode: EditChunkingMode;
  chunkingReason: string;
  estimatedChunks: number;
  effectiveChunkSize: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  effectiveMaxTokens: number;
  editingStylePreset: EditingStylePreset;
  editingFocus: EditingFocus;
  hasDraftText: boolean;
  hints: string[];
}

function estimateChunkCountHeuristic(text: string, chunkSize: number): number {
  const tokens = estimateTokensHeuristic(text);
  if (tokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokens / chunkSize));
}

export function buildEditExecutionPreview(input: EditExecutionPreviewInput): EditExecutionPreview {
  const hasDraftText = input.translatedText.trim().length > 0;

  const presetOpts = resolvePresetToEditOptions(input.preset);
  const editingStylePreset = input.stylePresetOverride ?? presetOpts.editingStylePreset;
  const editingFocus = input.focusOverride ?? presetOpts.editingFocus;

  const chunking = resolveEditChunkingMode({
    translatedText: input.translatedText,
    modelId: input.modelId,
    preset: input.preset,
    glossaryText: input.glossaryText,
    castText: input.castText,
    forceChunked: input.forceChunked,
    forceSingleShot: presetOpts.forceSingleShot,
    chunkSizeOverride: input.chunkSizeOverride,
    includeGlossary: input.includeGlossary,
  });

  const estimatedChunks =
    chunking.mode === 'single_shot'
      ? 1
      : hasDraftText
        ? estimateChunkCountHeuristic(input.translatedText, chunking.effectiveChunkSize)
        : 0;

  const hints: string[] = [];
  if (!hasDraftText) {
    hints.push('Add draft text for chunk and token estimates');
  }
  const draftChars = input.translatedText.length;
  const is41 = input.modelId.toLowerCase().includes('gpt-4.1-mini');

  if (
    hasDraftText &&
    input.preset === 'enhanced' &&
    is41 &&
    chunking.mode === 'chunked' &&
    draftChars >= 12_000
  ) {
    hints.push(
      'Draft is long for gpt-4.1-mini Enhanced. Try gpt-5.4-mini for single-shot on longer chapters.'
    );
  }
  if (hasDraftText && input.preset === 'enhanced' && chunking.mode === 'single_shot') {
    hints.push('Full draft in one API request.');
  }
  if (input.preset === 'fast') {
    hints.push('Fast preset always chunks for minimum latency per request.');
  }

  return {
    preset: input.preset,
    modelId: input.modelId,
    chunkingMode: chunking.mode,
    chunkingReason: chunking.reason,
    estimatedChunks,
    effectiveChunkSize: chunking.effectiveChunkSize,
    estimatedInputTokens: chunking.estimatedInputTokens,
    estimatedOutputTokens: chunking.estimatedOutputTokens,
    effectiveMaxTokens: chunking.effectiveMaxTokens,
    editingStylePreset,
    editingFocus,
    hasDraftText,
    hints,
  };
}

export { defaultEditPresetForModel };
