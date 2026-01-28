/**
 * Arcane Engine - AI-powered novel translation engine
 * 
 * EN → RU translation focus with 3-stage pipeline:
 * 1. Analyze: Extract entities, understand style
 * 2. Translate: Accurate translation with glossary
 * 3. Edit: Polish and refine
 * 
 * @module arcane-engine
 */

// Types
export type { Language, Gender, Declensions, TextChunk, TranslationConfig } from './types/common.js';
export type { Character, Location, Term, Glossary, GlossaryUpdate } from './types/glossary.js';
export type { 
  StyleProfile, 
  ChapterSummary, 
  CurrentContext, 
  NovelAgentState, 
  AnalysisResult, 
  AgentContext 
} from './types/agent.js';
export type { 
  StageType, 
  StageResult, 
  TranslationDraft, 
  EditedTranslation, 
  PipelineResult, 
  PipelineOptions 
} from './types/pipeline.js';

// Interfaces
export type { 
  ILLMProvider, 
  LLMProviderConfig, 
  Message, 
  CompletionOptions, 
  CompletionResult 
} from './interfaces/llm-provider.js';

// Providers
export { OpenAIProvider } from './providers/openai.js';

// Agent
export { NovelAgent } from './agents/novel-agent.js';

// Glossary
export { GlossaryManager } from './glossary/glossary-manager.js';
export { 
  declineName, 
  translateName, 
  transliterateToRussian,
  detectDeclensionPattern,
  COMMON_NAME_TRANSLATIONS 
} from './glossary/declension.js';

// Russian declension with Petrovich
export {
  declineNameRu,
  declineFirstName,
  detectGenderFromRussianName,
  transliterateEnToRu,
  translateAndDeclineName,
  EN_RU_NAMES,
} from './glossary/declension-ru.js';

// Pipeline
export { TranslationPipeline, type PipelineConfig } from './pipeline/translation-pipeline.js';

// Stages
export { AnalyzeStage } from './stages/stage-1-analyze.js';
export { TranslateStage } from './stages/stage-2-translate.js';
export { EditStage } from './stages/stage-3-edit.js';

// Utils
export { chunkText, mergeChunks, estimateTokens, splitIntoSections } from './utils/chunker.js';

// Prompts
export { 
  ANALYZER_SYSTEM_PROMPT, 
  createAnalyzerPrompt 
} from './prompts/system/analyzer.js';

export { 
  TRANSLATOR_SYSTEM_PROMPT, 
  createTranslatorPrompt, 
  createGlossaryPromptSection 
} from './prompts/system/translator.js';

export { 
  EDITOR_SYSTEM_PROMPT, 
  createEditorPrompt, 
  QUALITY_CHECK_PROMPT 
} from './prompts/system/editor.js';

