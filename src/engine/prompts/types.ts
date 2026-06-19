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
  /** Chapter-level context (cast, summaries) — not for translation. */
  context: string;
  /** 1–2 preceding paragraphs from this chapter (read-only). */
  leadingContext?: string;
  styleGuide: string;
  textBlockTypes?: TextBlockType[];
  customInstructions?: string;
  /** Include CoT analysis field in JSON output instructions. */
  enableCoT?: boolean;
}

export interface StagePromptBundle<TUserParams> {
  systemPrompt: string;
  createUserPrompt: (params: TUserParams) => string;
}

export type AnalyzerPromptBundle = StagePromptBundle<AnalyzerUserPromptParams>;
export type TranslatorPromptBundle = StagePromptBundle<TranslatorUserPromptParams>;
