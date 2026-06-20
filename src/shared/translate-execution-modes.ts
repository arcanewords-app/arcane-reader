/**
 * Translate execution modes (One-shot / Chunked) — SSOT for Lab and future prod Settings.
 */

export type TranslateExecutionMode = 'one_shot' | 'chunked';

/** @deprecated Legacy preset values stored in prompt_lab_runs */
export type LegacyTranslateQualityPreset = 'fast' | 'standard' | 'enhanced';

export const TRANSLATE_EXECUTION_MODES: Array<{
  value: TranslateExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: 'one_shot',
    label: 'One-shot',
    description:
      'Whole chapter in one API call when it fits — fewer tokens, faster. Long chapters fall back to large chunks (4500 tok).',
  },
  {
    value: 'chunked',
    label: 'Chunked',
    description:
      'Chapter split into sequential 3000-token chunks — more tokens, sharper per segment. Production default.',
  },
];

export interface PresetTranslateOptions {
  enableTranslateFewShot: boolean;
  enableTranslateCoT: boolean;
  translateLeadingContextParagraphs: number;
}

export function normalizeTranslateExecutionMode(
  value: string | undefined | null
): TranslateExecutionMode {
  if (value === 'one_shot' || value === 'enhanced') return 'one_shot';
  if (value === 'chunked' || value === 'fast' || value === 'standard') return 'chunked';
  return 'chunked';
}

export function resolveExecutionModeToTranslateOptions(
  mode: TranslateExecutionMode
): PresetTranslateOptions {
  switch (mode) {
    case 'chunked':
      return {
        enableTranslateFewShot: false,
        enableTranslateCoT: false,
        translateLeadingContextParagraphs: 0,
      };
    case 'one_shot':
      return {
        enableTranslateFewShot: true,
        enableTranslateCoT: true,
        translateLeadingContextParagraphs: 2,
      };
  }
}

/** Default mode when user picks a model in Prompt Lab translate. */
export function defaultExecutionModeForModel(modelId: string): TranslateExecutionMode {
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

/** Infer mode from legacy granular run params or old preset strings. */
export function inferExecutionModeFromLegacyParams(params: {
  translateExecutionMode?: string;
  translateQualityPreset?: string;
  enableTranslateCoT?: boolean;
  enableTranslateFewShot?: boolean;
  miniModelTranslationProfile?: boolean;
  translateLeadingContextParagraphs?: number;
}): TranslateExecutionMode {
  if (params.translateExecutionMode) {
    return normalizeTranslateExecutionMode(params.translateExecutionMode);
  }
  if (params.translateQualityPreset) {
    return normalizeTranslateExecutionMode(params.translateQualityPreset);
  }
  if (params.enableTranslateCoT) return 'one_shot';
  if (
    params.enableTranslateFewShot ||
    params.miniModelTranslationProfile ||
    (params.translateLeadingContextParagraphs ?? 0) > 0
  ) {
    return 'one_shot';
  }
  return 'chunked';
}

export function executionModeLabel(mode: TranslateExecutionMode): string {
  return TRANSLATE_EXECUTION_MODES.find((p) => p.value === mode)?.label ?? mode;
}

// Back-compat aliases (remove after full migration)
export type TranslateQualityPreset = TranslateExecutionMode;
export const TRANSLATE_QUALITY_PRESETS = TRANSLATE_EXECUTION_MODES;
export const resolvePresetToTranslateOptions = resolveExecutionModeToTranslateOptions;
export const defaultPresetForModel = defaultExecutionModeForModel;
export const inferPresetFromLegacyParams = inferExecutionModeFromLegacyParams;
export const presetLabel = executionModeLabel;
