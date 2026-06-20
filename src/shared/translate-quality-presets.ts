/**
 * Translate quality presets (Fast / Standard / Enhanced) — SSOT for Lab and future prod Settings.
 */

export type TranslateQualityPreset = 'fast' | 'standard' | 'enhanced';

export const TRANSLATE_QUALITY_PRESETS: Array<{
  value: TranslateQualityPreset;
  label: string;
  description: string;
}> = [
  {
    value: 'fast',
    label: 'Fast',
    description: 'Chunked, no CoT — minimum tokens',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Chunked, no CoT — default production quality',
  },
  {
    value: 'enhanced',
    label: 'Enhanced',
    description: 'CoT + few-shot; single-shot when chapter fits budget',
  },
];

export interface PresetTranslateOptions {
  enableTranslateFewShot: boolean;
  enableTranslateCoT: boolean;
  translateLeadingContextParagraphs: number;
}

export function resolvePresetToTranslateOptions(
  preset: TranslateQualityPreset
): PresetTranslateOptions {
  switch (preset) {
    case 'fast':
      return {
        enableTranslateFewShot: false,
        enableTranslateCoT: false,
        translateLeadingContextParagraphs: 0,
      };
    case 'standard':
      return {
        enableTranslateFewShot: false,
        enableTranslateCoT: false,
        translateLeadingContextParagraphs: 0,
      };
    case 'enhanced':
      return {
        enableTranslateFewShot: true,
        enableTranslateCoT: true,
        translateLeadingContextParagraphs: 2,
      };
  }
}

/** Default preset when user picks a model in Prompt Lab translate. */
export function defaultPresetForModel(modelId: string): TranslateQualityPreset {
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
export function inferPresetFromLegacyParams(params: {
  enableTranslateCoT?: boolean;
  enableTranslateFewShot?: boolean;
  miniModelTranslationProfile?: boolean;
  translateLeadingContextParagraphs?: number;
}): TranslateQualityPreset {
  if (params.enableTranslateCoT) return 'enhanced';
  if (
    params.enableTranslateFewShot ||
    params.miniModelTranslationProfile ||
    (params.translateLeadingContextParagraphs ?? 0) > 0
  ) {
    return 'enhanced';
  }
  return 'standard';
}

export function presetLabel(preset: TranslateQualityPreset): string {
  return TRANSLATE_QUALITY_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}
