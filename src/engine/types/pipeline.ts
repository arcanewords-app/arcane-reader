/**
 * Translation pipeline types
 */

import type { AnalysisResult, AgentContext } from './agent.js';

export type StageType = 'analyze' | 'translate' | 'edit';

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
  /** When true, never split a single paragraph into smaller chunks (chunker). Default true. */
  neverSplitParagraphs?: boolean;
}
