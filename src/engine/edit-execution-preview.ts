/**
 * Live preview of edit execution plan (Prompt Lab).
 */

import { resolveEditChunkingMode, type EditChunkingMode } from './edit-chunking-policy.js';
import {
  defaultEditExecutionModeForModel,
  resolveExecutionModeToEditOptions,
  type EditExecutionMode,
} from '../shared/edit-execution-modes.js';
import type { EditingFocus, EditingStylePreset } from './prompts/system/editor.js';
import { chunkText } from './utils/chunker-core.js';
import {
  ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE,
  EDIT_STANDARD_CHUNK_SIZE,
} from '../shared/edit-execution-modes.js';

export interface EditExecutionPreviewInput {
  executionMode: EditExecutionMode;
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
  executionMode: EditExecutionMode;
  modelId: string;
  chunkingMode: EditChunkingMode;
  chunkingReason: string;
  chunkSizeTier: 'single' | 'large' | 'standard';
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

function estimateChunkCount(
  text: string,
  chunkingMode: EditChunkingMode,
  effectiveChunkSize: number
): number {
  if (chunkingMode === 'single_shot') return 1;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return chunkText(trimmed, {
    maxTokens: effectiveChunkSize,
    preserveParagraphs: true,
    neverSplitParagraphs: true,
  }).length;
}

export function buildEditExecutionPreview(input: EditExecutionPreviewInput): EditExecutionPreview {
  const hasDraftText = input.translatedText.trim().length > 0;

  const presetOpts = resolveExecutionModeToEditOptions(input.executionMode);
  const editingStylePreset = input.stylePresetOverride ?? presetOpts.editingStylePreset;
  const editingFocus = input.focusOverride ?? presetOpts.editingFocus;

  const chunking = resolveEditChunkingMode({
    translatedText: input.translatedText,
    modelId: input.modelId,
    executionMode: input.executionMode,
    glossaryText: input.glossaryText,
    castText: input.castText,
    forceChunked: input.forceChunked,
    forceSingleShot: presetOpts.forceSingleShot,
    chunkSizeOverride: input.chunkSizeOverride,
    includeGlossary: input.includeGlossary,
  });

  const estimatedChunks = !hasDraftText
    ? 0
    : chunking.mode === 'single_shot'
      ? 1
      : estimateChunkCount(input.translatedText, chunking.mode, chunking.effectiveChunkSize);

  const hints: string[] = [];
  if (!hasDraftText) {
    hints.push('Add draft text for chunk and token estimates');
  }
  const draftChars = input.translatedText.length;
  const is41 = input.modelId.toLowerCase().includes('gpt-4.1-mini');

  if (
    hasDraftText &&
    input.executionMode === 'one_shot' &&
    is41 &&
    chunking.mode === 'chunked' &&
    draftChars >= 12_000
  ) {
    hints.push(
      'Draft is long for gpt-4.1-mini One-shot. Try gpt-5.4-mini for single-shot on longer chapters.'
    );
  }
  if (hasDraftText && input.executionMode === 'one_shot' && chunking.mode === 'single_shot') {
    hints.push('Full draft in one API request.');
  }
  if (input.executionMode === 'one_shot' && chunking.reason === 'one_shot_large_chunks') {
    hints.push(
      `Draft exceeds one-shot budget → large chunks (${ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE} tok).`
    );
  }
  if (input.executionMode === 'chunked' && chunking.mode === 'chunked') {
    hints.push(`Standard chunks (${EDIT_STANDARD_CHUNK_SIZE} tok).`);
  }

  return {
    executionMode: input.executionMode,
    modelId: input.modelId,
    chunkingMode: chunking.mode,
    chunkingReason: chunking.reason,
    chunkSizeTier: chunking.chunkSizeTier,
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

export { defaultEditExecutionModeForModel as defaultEditPresetForModel };
