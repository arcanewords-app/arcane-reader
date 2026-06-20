/**
 * Edit quality presets (Fast / Standard / Enhanced) — SSOT for Prompt Lab.
 */

import type {
  EditingFocus,
  EditingStylePreset,
  LegacyEditingFocus,
} from '../engine/prompts/system/editor.js';
import { normalizeEditingFocus } from '../engine/prompts/system/editor.js';

export type EditQualityPreset = 'fast' | 'standard' | 'enhanced';

export const EDIT_QUALITY_PRESETS: Array<{
  value: EditQualityPreset;
  label: string;
  description: string;
}> = [
  {
    value: 'fast',
    label: 'Fast',
    description: 'Minimal polish, fix problems — always chunked',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Default style — chunked for long drafts',
  },
  {
    value: 'enhanced',
    label: 'Enhanced',
    description: 'Literary polish — single-shot when draft fits budget',
  },
];

export const EDIT_FAST_CHUNK_SIZE = 1200;
export const EDIT_STANDARD_CHUNK_SIZE = 2000;
export const EDIT_AUTO_CHUNK_TOKEN_THRESHOLD = 3000;

export interface PresetEditOptions {
  editingStylePreset: EditingStylePreset;
  editingFocus: EditingFocus;
  forceChunked: boolean;
  forceSingleShot: boolean;
  defaultChunkSize: number;
}

export function resolvePresetToEditOptions(preset: EditQualityPreset): PresetEditOptions {
  switch (preset) {
    case 'fast':
      return {
        editingStylePreset: 'minimal',
        editingFocus: 'fix_only',
        forceChunked: true,
        forceSingleShot: false,
        defaultChunkSize: EDIT_FAST_CHUNK_SIZE,
      };
    case 'standard':
      return {
        editingStylePreset: 'default',
        editingFocus: 'polish',
        forceChunked: false,
        forceSingleShot: false,
        defaultChunkSize: EDIT_STANDARD_CHUNK_SIZE,
      };
    case 'enhanced':
      return {
        editingStylePreset: 'literary',
        editingFocus: 'polish',
        forceChunked: false,
        forceSingleShot: true,
        defaultChunkSize: EDIT_STANDARD_CHUNK_SIZE,
      };
  }
}

/** Default preset when user picks a model in Prompt Lab edit. */
export function defaultEditPresetForModel(modelId: string): EditQualityPreset {
  const m = (modelId || '').toLowerCase();
  if (
    m.startsWith('gpt-5.4-mini') ||
    m === 'gpt-5.4-mini' ||
    m.startsWith('o4-mini') ||
    m === 'o4-mini'
  ) {
    return 'enhanced';
  }
  return 'standard';
}

/** Infer preset from legacy granular run params (saved runs before preset UI). */
export function inferEditPresetFromLegacyParams(params: {
  preset?: EditingStylePreset | string | null;
  focus?: EditingFocus | LegacyEditingFocus | string | null;
}): EditQualityPreset {
  const style = params.preset;
  const focus = normalizeEditingFocus(params.focus);
  if (style === 'minimal' && focus === 'fix_only') return 'fast';
  if (style === 'literary') return 'enhanced';
  if (style === 'ai_revivification') return 'enhanced';
  return 'standard';
}

export function editPresetLabel(preset: EditQualityPreset): string {
  return EDIT_QUALITY_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}
