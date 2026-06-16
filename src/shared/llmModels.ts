/**
 * Shared LLM model list and helpers (main app settings + Prompt Lab).
 * Excludes responses-only models (gpt-5.1-codex-mini, codex-mini-latest).
 */

export interface LlmModelOption {
  value: string;
  label: string;
}

/** Promo models that support Chat Completions API. */
export const LLM_MODELS: LlmModelOption[] = [
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'o1-mini', label: 'O1 Mini' },
  { value: 'o3-mini', label: 'O3 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
];

export const DEFAULT_LLM_MODEL = 'gpt-4.1-mini';

export const ANALYSIS_RECOMMENDED_MODELS = ['gpt-4.1-mini', 'gpt-4o-mini'] as const;

/** Models that only support default temperature (gpt-5*, o1-, o3-, o4-). */
export function modelUsesDefaultTemperature(modelId: string): boolean {
  const m = (modelId || '').toLowerCase();
  return m.startsWith('o1-') || m.startsWith('o3-') || m.startsWith('o4-') || m.startsWith('gpt-5');
}

/** Reasoning models: not recommended for analysis (slow). */
export function isReasoningModel(modelId: string): boolean {
  return modelUsesDefaultTemperature(modelId);
}

export function isModelInList(modelId: string): boolean {
  return LLM_MODELS.some((m) => m.value === modelId);
}

export type LlmStage = 'analysis' | 'translation' | 'editing' | 'analyze' | 'translate' | 'edit';

/** Models allowed for a pipeline stage in UI selectors. */
export function modelsForStage(stage: LlmStage): LlmModelOption[] {
  const normalized =
    stage === 'analyze' || stage === 'analysis'
      ? 'analysis'
      : stage === 'translate' || stage === 'translation'
        ? 'translation'
        : 'editing';
  if (normalized === 'analysis') {
    return LLM_MODELS.filter((m) => !isReasoningModel(m.value));
  }
  return LLM_MODELS;
}

export function analysisExcludedModelIds(): string[] {
  return LLM_MODELS.filter((m) => isReasoningModel(m.value)).map((m) => m.value);
}
