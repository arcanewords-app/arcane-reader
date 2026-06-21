/**
 * Production model pickers (main app settings). Shared by llmModels and modelAccess.
 */

export interface LlmModelOption {
  value: string;
  label: string;
}

export type LlmStage = 'analysis' | 'translation' | 'editing' | 'analyze' | 'translate' | 'edit';

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
