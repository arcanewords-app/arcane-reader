/**
 * Edit execution modes (One-shot / Chunked) — SSOT for Prompt Lab.
 */

import type {
  EditingFocus,
  EditingStylePreset,
  LegacyEditingFocus,
} from '../engine/prompts/system/editor.js';

export type EditExecutionMode = 'one_shot' | 'chunked';

/** Advanced override: minimal polish with small chunks */
export const EDIT_MINIMAL_CHUNK_SIZE = 1200;

export const EDIT_STANDARD_CHUNK_SIZE = 3000;
export const ONE_SHOT_EDIT_FALLBACK_CHUNK_SIZE = 4500;
export const EDIT_AUTO_CHUNK_TOKEN_THRESHOLD = 3000;

export const EDIT_EXECUTION_MODES: Array<{
  value: EditExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: 'one_shot',
    label: 'One-shot',
    description:
      'Polish the full draft in one call when it fits — fewer round-trips. Literary style. Long drafts use large chunks (4500 tok).',
  },
  {
    value: 'chunked',
    label: 'Chunked',
    description:
      'Polish segment by segment (3000 tok) — more tokens, better control on long drafts. Default style.',
  },
];

export interface PresetEditOptions {
  editingStylePreset: EditingStylePreset;
  editingFocus: EditingFocus;
  forceChunked: boolean;
  forceSingleShot: boolean;
  defaultChunkSize: number;
}

export function normalizeEditExecutionMode(value: string | undefined | null): EditExecutionMode {
  if (value === 'one_shot' || value === 'enhanced') return 'one_shot';
  if (value === 'chunked' || value === 'fast' || value === 'standard') return 'chunked';
  return 'chunked';
}

export function resolveExecutionModeToEditOptions(mode: EditExecutionMode): PresetEditOptions {
  switch (mode) {
    case 'chunked':
      return {
        editingStylePreset: 'default',
        editingFocus: 'polish',
        forceChunked: false,
        forceSingleShot: false,
        defaultChunkSize: EDIT_STANDARD_CHUNK_SIZE,
      };
    case 'one_shot':
      return {
        editingStylePreset: 'literary',
        editingFocus: 'polish',
        forceChunked: false,
        forceSingleShot: true,
        defaultChunkSize: EDIT_STANDARD_CHUNK_SIZE,
      };
  }
}

export function defaultEditExecutionModeForModel(modelId: string): EditExecutionMode {
  const m = (modelId || '').toLowerCase();
  if (
    m.startsWith('gpt-5.4-mini') ||
    m === 'gpt-5.4-mini' ||
    m.startsWith('o4-mini') ||
    m === 'o4-mini'
  ) {
    return 'one_shot';
  }
  return 'chunked';
}

export function inferEditExecutionModeFromLegacyParams(params: {
  editExecutionMode?: string;
  editQualityPreset?: string;
  preset?: EditingStylePreset | string | null;
  focus?: EditingFocus | LegacyEditingFocus | string | null;
}): EditExecutionMode {
  if (params.editExecutionMode) {
    return normalizeEditExecutionMode(params.editExecutionMode);
  }
  if (params.editQualityPreset) {
    return normalizeEditExecutionMode(params.editQualityPreset);
  }
  const style = params.preset;
  if (style === 'literary' || style === 'ai_revivification') return 'one_shot';
  return 'chunked';
}

export function editExecutionModeLabel(mode: EditExecutionMode): string {
  return EDIT_EXECUTION_MODES.find((p) => p.value === mode)?.label ?? mode;
}

// Back-compat aliases
export type EditQualityPreset = EditExecutionMode;
export const EDIT_QUALITY_PRESETS = EDIT_EXECUTION_MODES;
export const EDIT_FAST_CHUNK_SIZE = EDIT_MINIMAL_CHUNK_SIZE;
export const resolvePresetToEditOptions = resolveExecutionModeToEditOptions;
export const defaultEditPresetForModel = defaultEditExecutionModeForModel;
export const inferEditPresetFromLegacyParams = inferEditExecutionModeFromLegacyParams;
export const editPresetLabel = editExecutionModeLabel;
