/**
 * Arcane Engine - AI-powered novel translation engine
 *
 * Multi-source → RU translation with 3-stage pipeline:
 * 1. Analyze: Extract entities, understand style
 * 2. Translate: Accurate translation with glossary
 * 3. Edit: Polish and refine
 *
 * @module arcane-engine
 */

// Types
export type {
  Language,
  Gender,
  Declensions,
  TextChunk,
  TranslationConfig,
  TextBlockType,
  TextBlockHtmlTag,
} from './types/common.js';
export type { Character, Location, Term, Glossary, GlossaryUpdate } from './types/glossary.js';
export type {
  StyleProfile,
  ChapterSummary,
  CurrentContext,
  NovelAgentState,
  AnalysisResult,
  AgentContext,
} from './types/agent.js';
export type {
  StageType,
  StageResult,
  TranslationDraft,
  EditedTranslation,
  PipelineResult,
  PipelineOptions,
  StagePromptOverrides,
} from './types/pipeline.js';

// Interfaces
export type {
  ILLMProvider,
  LLMProviderConfig,
  Message,
  CompletionOptions,
  CompletionResult,
} from './interfaces/llm-provider.js';

// Providers
export { OpenAIProvider } from './providers/openai.js';

// Agent
export { NovelAgent } from './agents/novel-agent.js';

// Glossary
export { GlossaryManager } from './glossary/glossary-manager.js';
export {
  filterGlossaryForChunk,
  filterGlossaryByChapter,
  getChapterCastCharacters,
  type GlossaryChunkMatchMode,
} from './glossary/glossary-filter.js';
export {
  declineName,
  translateName,
  transliterateToRussian,
  detectDeclensionPattern,
  COMMON_NAME_TRANSLATIONS,
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

// Language pair (MVP)
export {
  PROJECT_DEFAULT_SOURCE_LANGUAGE,
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  SUPPORTED_SOURCE_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGES,
  SUPPORTED_TRANSLATION_PAIRS,
  sourcesForTarget,
  parseProjectLanguage,
  parseProjectLanguagePair,
  pairKey,
  isSupportedPair,
  assertSupportedPair,
  languageDisplayName,
  isLatinScriptName,
} from './language.js';

// Utils
export {
  chunkText,
  mergeChunks,
  estimateTokens,
  splitIntoSections,
  type MergeChunkInput,
} from './utils/chunker.js';
export {
  estimateTokensHeuristic,
  countCjkCharacters,
  isCjkCharCode,
} from './utils/token-estimate.js';

// Error constants
export { CHUNK_ERROR_PREFIX, formatChunkError, isChunkError } from './constants/errors.js';

// Prompts
export {
  resolvePrompts,
  ANALYZER_SYSTEM_PROMPT,
  createAnalyzerPrompt,
  TRANSLATOR_SYSTEM_PROMPT,
  createTranslatorPrompt,
  createGlossaryPromptSection,
} from './prompts/registry.js';

export {
  EDITOR_SYSTEM_PROMPT,
  EDITOR_SYSTEM_PROMPTS,
  createEditorPrompt,
  getEditorSystemPrompt,
  QUALITY_CHECK_PROMPT,
  type EditingFocus,
  type EditingStylePreset,
} from './prompts/system/editor.js';

export {
  getEffectiveStagePrompts,
  type EffectiveStagePromptOptions,
  type EffectiveStagePrompts,
} from './prompts/effective-prompts.js';
