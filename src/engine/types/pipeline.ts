/**
 * Translation pipeline types
 */

import type { AnalysisResult, AgentContext } from './agent.js';

export type StageType = 'analyze' | 'translate' | 'edit';

/** Optional prompt overrides for dev tools (Prompt Lab). Production pipeline ignores unless set. */
export interface StagePromptOverrides {
  systemPromptOverride?: string;
  userPromptOverride?: string;
}

export interface StageResult<T> {
  stage: StageType;
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  duration: number; // ms
}

export interface TranslationDraft {
  originalText: string;
  translatedText: string;
  chunkResults: ChunkTranslation[];
}

export interface ChunkTranslation {
  chunkId: string;
  original: string;
  translated: string;
  notes?: string;
  /** Present when chunk failed after retries; translated contains formatChunkError(msg). */
  error?: string;
}

export interface EditedTranslation {
  finalText: string;
  changes: EditChange[];
  qualityScore?: number;
}

export interface EditChange {
  before: string;
  after: string;
  reason: string;
}

export interface PipelineResult {
  chapterNumber: number;
  originalText: string;

  stage1: StageResult<AnalysisResult>;
  stage2: StageResult<TranslationDraft>;
  stage3: StageResult<EditedTranslation>;

  finalTranslation: string;

  totalTokensUsed: number;
  totalDuration: number;

  updatedContext: AgentContext;

  /** When true, user cancelled after stage 1; server should save glossary and set status to pending. */
  cancelled?: boolean;
}

export interface PipelineOptions {
  skipAnalysis?: boolean; // Skip stage 1 if glossary is complete
  skipEditing?: boolean; // Skip stage 3 for faster translation
  chunkSize?: number; // Override default chunk size
  retryAttempts?: number; // Number of retries on failure
  /** Run only this stage; overrides skipAnalysis/skipEditing */
  runOnlyStage?: 'analysis' | 'translation' | 'editing';
  /** Run only these stages in order (multi-select); overrides runOnlyStage/skip* */
  runStages?: ('analysis' | 'translation' | 'editing')[];
  /** For editing-only: existing translated text to edit */
  existingTranslatedTextForEdit?: string;
  /** Per-stage temperature (0–1). Used by each stage when calling the provider. */
  temperatureByStage?: {
    analysis?: number;
    translation?: number;
    editing?: number;
  };
  /** When true, pipeline should throw 'Cancelled' and stop (used when user clicks Cancel on UI). */
  isCancelled?: () => boolean;
  /** Delay in ms before retrying a failed chunk (Stage 2). Default 1500. */
  chunkRetryDelayMs?: number;
  /** Max chunks to process in parallel for translation (default 1). Use 2-3 for faster translation. */
  parallelChunks?: number;
  /** When true, never split a single paragraph into smaller chunks (chunker). Default true. */
  neverSplitParagraphs?: boolean;
  /** When false, analysis stage does not receive existing glossary (saves tokens). Default true. */
  includeGlossaryInAnalysis?: boolean;
  /** Max tokens per section for chunked analysis of long chapters. Default 8000. Set 0 to disable. */
  analysisMaxSectionTokens?: number;
  /** When false, translation stage does not receive glossary; chunks 3500 (terms in editing). Default true. */
  includeGlossaryInTranslation?: boolean;
  /** When false, editing stage does not receive glossary; chunks 3500. Default true. */
  includeGlossaryInEditing?: boolean;
  /** Text block types for special formatting (system messages, notes, etc.) */
  textBlockTypes?: import('./common.js').TextBlockType[];
  /** Custom instructions for translator and editor stages */
  customInstructions?: { translation?: string; editing?: string };
  /** Editing style preset: default, literary, minimal, ai_revivification */
  editingStylePreset?: import('../prompts/system/editor.js').EditingStylePreset;
  /** Editing focus: fix_problems, style_only, both */
  editingFocus?: import('../prompts/system/editor.js').EditingFocus;
  /** When true, run quality check after chunked editing. Default false. */
  checkQualityForChunked?: boolean;
  /** Timeout in ms for quality check when chunked. Default 30000. */
  qualityCheckTimeoutMs?: number;
  /** Called when chunk progress updates (chunksDone, totalChunks, stage). Used for UI progress display. */
  onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
}
