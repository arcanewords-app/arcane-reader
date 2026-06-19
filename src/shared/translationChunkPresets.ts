/**
 * Translation chunk size presets and mini-model helpers (prod + Prompt Lab).
 *
 * Rollout: enable per-project via ProjectSettings:
 * - miniModelTranslationProfile — chunk 1200 + leading 2 + few-shot
 * - enableTranslateFewShot / enableTranslateCoT / translateLeadingContextParagraphs — à la carte
 * Mini models (name contains mini/nano) auto-use 1200 token chunks when no override.
 */

export const TRANSLATION_CHUNK_PRESETS = [
  { value: 800, label: '800 (~500 words)' },
  { value: 1200, label: '1200 (~750 words)' },
  { value: 2000, label: '2000 (legacy default)' },
  { value: 3500, label: '3500 (large / edit pipeline)' },
] as const;

/** Recommended default for mini chat models (gpt-4o-mini, gpt-4.1-mini, etc.). */
export const MINI_MODEL_TRANSLATION_CHUNK_SIZE = 1200;

/** Legacy prod default when glossary is included in translate. */
export const DEFAULT_TRANSLATION_CHUNK_SIZE = 2000;

/** When editing follows translate and glossary is omitted from Stage 2. */
export const TRANSLATION_CHUNK_SIZE_WHEN_EDITING = 2000;

export function isMiniChatModel(modelId: string): boolean {
  const m = (modelId || '').toLowerCase();
  return (
    m.includes('mini') ||
    m.includes('nano') ||
    m === 'gpt-4o-mini' ||
    m.startsWith('gpt-4.1-mini') ||
    m.startsWith('gpt-4.1-nano') ||
    m.startsWith('gpt-5-mini') ||
    m.startsWith('gpt-5-nano')
  );
}

export function resolveTranslationChunkSize(options: {
  override?: number;
  modelId?: string;
  includeGlossaryInTranslation?: boolean;
  miniModelProfile?: boolean;
}): number {
  if (options.override != null && options.override > 0) {
    return options.override;
  }
  if (options.miniModelProfile) {
    return MINI_MODEL_TRANSLATION_CHUNK_SIZE;
  }
  const modelId = options.modelId ?? '';
  if (isMiniChatModel(modelId)) {
    return MINI_MODEL_TRANSLATION_CHUNK_SIZE;
  }
  return options.includeGlossaryInTranslation === false
    ? TRANSLATION_CHUNK_SIZE_WHEN_EDITING
    : DEFAULT_TRANSLATION_CHUNK_SIZE;
}
