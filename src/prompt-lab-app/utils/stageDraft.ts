import type { EditingFocus, EditingPreset, LabLanguage, LabStage } from '../api/client';

export interface StageDraft {
  systemPrompt: string;
  baselineSystemPrompt: string;
  userPromptOverride: string;
  useUserOverride: boolean;
  userPreview: string;
  baselineUserPreview: string;
  promptVersion: string;
  dirty: boolean;
  temperature: string;
  model: string;
}

export function buildStageDraftKey(
  stage: LabStage,
  sourceLanguage: LabLanguage,
  targetLanguage: LabLanguage,
  preset: EditingPreset,
  focus: EditingFocus
): string {
  if (stage === 'edit') {
    return `edit:${targetLanguage}:${preset}:${focus}`;
  }
  return `${stage}:${sourceLanguage}:${targetLanguage}`;
}

export function defaultTemperatureForStage(stage: LabStage): string {
  if (stage === 'analyze') return '0.3';
  if (stage === 'edit') return '0.5';
  return '0.7';
}
