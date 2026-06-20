/**
 * Translation chunk size presets and tiered chunking (prod + Prompt Lab).
 */

export type ChunkingModeRef = 'single_shot' | 'chunked';
export type ExecutionModeRef = 'one_shot' | 'chunked';

export const TRANSLATION_CHUNK_PRESETS = [
  { value: 800, label: '800 (~500 words)' },
  { value: 1200, label: '1200 (~750 words)' },
  { value: 2000, label: '2000 (legacy)' },
  { value: 3000, label: '3000 (default)' },
  { value: 3500, label: '3500 (large / no glossary)' },
  { value: 4500, label: '4500 (one-shot fallback)' },
] as const;

/** Rollout profile only — not auto-applied for mini model names. */
export const MINI_MODEL_TRANSLATION_CHUNK_SIZE = 1200;

/** Default chunked translate size (tier 3). */
export const DEFAULT_TRANSLATION_CHUNK_SIZE = 3000;

/** One-shot overflow: large sequential chunks (tier 2). */
export const ONE_SHOT_FALLBACK_CHUNK_SIZE = 4500;

/** When editing follows translate and glossary is omitted from Stage 2. */
export const TRANSLATION_CHUNK_SIZE_WHEN_EDITING = 3000;

export type ChunkSizeTier = 'single' | 'large' | 'standard';

export function resolveChunkSizeTier(
  executionMode: ExecutionModeRef,
  chunkingMode: ChunkingModeRef
): ChunkSizeTier {
  if (chunkingMode === 'single_shot') return 'single';
  if (executionMode === 'one_shot') return 'large';
  return 'standard';
}

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

export interface ResolveTranslationChunkSizeInput {
  override?: number;
  modelId?: string;
  includeGlossaryInTranslation?: boolean;
  miniModelProfile?: boolean;
  executionMode?: ExecutionModeRef;
  chunkingMode?: ChunkingModeRef;
}

export function resolveTranslationChunkSize(input: ResolveTranslationChunkSizeInput): number {
  if (input.override != null && input.override > 0) {
    return input.override;
  }
  if (input.miniModelProfile) {
    return MINI_MODEL_TRANSLATION_CHUNK_SIZE;
  }
  if (input.executionMode === 'one_shot' && input.chunkingMode === 'chunked') {
    return ONE_SHOT_FALLBACK_CHUNK_SIZE;
  }
  if (input.includeGlossaryInTranslation === false) {
    return TRANSLATION_CHUNK_SIZE_WHEN_EDITING;
  }
  return DEFAULT_TRANSLATION_CHUNK_SIZE;
}
