/**
 * Shared LLM model list and helpers (main app settings + Prompt Lab).
 * Excludes responses-only models (gpt-5.1-codex-mini, codex-mini-latest).
 */

import {
  isReasoningModel as adapterIsReasoningModel,
  modelUsesDefaultTemperature as adapterModelUsesDefaultTemperature,
  resolveModelCapabilities,
  type ModelCapabilities,
} from './openaiModelAdapter.js';

export interface LlmModelOption {
  value: string;
  label: string;
}

/** Promo models that support Chat Completions API. */
export const LLM_MODELS: LlmModelOption[] = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
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

/** Primary translate/edit models (one-shot capable). */
export const TRANSLATION_RECOMMENDED_MODELS = ['gpt-5.4-mini', 'o4-mini'] as const;

/** Legacy translate/edit models (chunked default). */
export const TRANSLATION_LEGACY_MODELS = ['gpt-4.1-mini'] as const;

/** Default for new projects (translate + edit). */
export const DEFAULT_TRANSLATION_STAGE_MODEL = 'gpt-5.4-mini';

/** Prompt Lab translate: focused model trio. */
export const PROMPT_LAB_TRANSLATE_MODELS: LlmModelOption[] = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
];

/** Production settings: translate + edit (5.4 → o4 → 4.1). */
export const PROD_TRANSLATE_EDIT_MODELS: LlmModelOption[] = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

/** Production settings: analysis only. */
export const PROD_ANALYSIS_MODELS: LlmModelOption[] = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

/** Prompt Lab analyze: non-reasoning only. */
export const PROMPT_LAB_ANALYZE_MODELS: LlmModelOption[] = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

/** Prompt Lab edit: focused model trio (matches translate). */
export const PROMPT_LAB_EDIT_MODELS: LlmModelOption[] = [
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'o4-mini', label: 'O4 Mini' },
];

export const ANALYSIS_RECOMMENDED_MODELS = ['gpt-4.1-mini', 'gpt-4o-mini'] as const;

/** Models that only support the default temperature (gpt-5*, o1-, o3-, o4-). */
export function modelUsesDefaultTemperature(modelId: string): boolean {
  return adapterModelUsesDefaultTemperature(modelId);
}

/** Reasoning models: not recommended for analysis (slow). */
export function isReasoningModel(modelId: string): boolean {
  return adapterIsReasoningModel(modelId);
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return resolveModelCapabilities(modelId);
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

/** Models shown in Prompt Lab UI (subset of LLM_MODELS). */
export function modelsForPromptLabStage(stage: LlmStage): LlmModelOption[] {
  const normalized =
    stage === 'analyze' || stage === 'analysis'
      ? 'analysis'
      : stage === 'translate' || stage === 'translation'
        ? 'translation'
        : 'editing';
  if (normalized === 'analysis') return PROMPT_LAB_ANALYZE_MODELS;
  if (normalized === 'translation') return PROMPT_LAB_TRANSLATE_MODELS;
  return PROMPT_LAB_EDIT_MODELS;
}

/** Models shown in main app project settings (subset, Lab-aligned). */
export function modelsForProdSettings(stage: LlmStage): LlmModelOption[] {
  const normalized =
    stage === 'analyze' || stage === 'analysis'
      ? 'analysis'
      : stage === 'translate' || stage === 'translation'
        ? 'translation'
        : 'editing';
  if (normalized === 'analysis') return PROD_ANALYSIS_MODELS;
  return PROD_TRANSLATE_EDIT_MODELS;
}

export function isModelInProdSettingsList(stage: LlmStage, modelId: string): boolean {
  return modelsForProdSettings(stage).some((m) => m.value === modelId);
}

export function promptLabModelCapabilitiesForUi(): Array<LlmModelOption & ModelCapabilities> {
  const ids = new Set([
    ...PROMPT_LAB_TRANSLATE_MODELS.map((m) => m.value),
    ...PROMPT_LAB_ANALYZE_MODELS.map((m) => m.value),
    ...PROMPT_LAB_EDIT_MODELS.map((m) => m.value),
  ]);
  return LLM_MODELS.filter((m) => ids.has(m.value)).map((m) => ({
    ...m,
    ...resolveModelCapabilities(m.value),
  }));
}

export function analysisExcludedModelIds(): string[] {
  return LLM_MODELS.filter((m) => isReasoningModel(m.value)).map((m) => m.value);
}

export function modelCapabilitiesForUi(): Array<LlmModelOption & ModelCapabilities> {
  return LLM_MODELS.map((m) => ({
    ...m,
    ...resolveModelCapabilities(m.value),
  }));
}
