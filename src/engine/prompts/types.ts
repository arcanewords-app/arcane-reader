import type { TextBlockType } from '../types/common.js';

export type PromptStage = 'analyze' | 'translate' | 'edit';

export interface AnalyzerUserPromptParams {
  sourceText: string;
  sourceLanguageLabel: string;
  targetLanguageLabel: string;
  existingGlossary?: string;
}

export interface TranslatorUserPromptParams {
  sourceText: string;
  sourceLanguageLabel: string;
  targetLanguageLabel: string;
  glossary: string;
  context: string;
  styleGuide: string;
  textBlockTypes?: TextBlockType[];
  customInstructions?: string;
}

export interface StagePromptBundle<TUserParams> {
  systemPrompt: string;
  createUserPrompt: (params: TUserParams) => string;
}

export type AnalyzerPromptBundle = StagePromptBundle<AnalyzerUserPromptParams>;
export type TranslatorPromptBundle = StagePromptBundle<TranslatorUserPromptParams>;
