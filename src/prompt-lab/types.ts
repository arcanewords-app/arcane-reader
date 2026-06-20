/**
 * Prompt Lab shared types (server + optional client reuse).
 */

import type { AnalysisResult } from '../engine/types/agent.js';
import type { EditingFocus, EditingStylePreset } from '../engine/prompts/system/editor.js';
import type { Language } from '../engine/types/common.js';
import type { StageType } from '../engine/types/pipeline.js';
import type { GlossaryImportEntry } from '../api/schemas/glossary.js';

export type PromptLabStage = StageType;

export interface PromptLabTextRow {
  id: string;
  title: string;
  source_language: Language;
  target_language: Language;
  stage_hint: string | null;
  content: string;
  translated_text: string | null;
  glossary_snapshot: GlossaryImportEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface PromptLabPromptRow {
  id: string;
  stage: PromptLabStage;
  source_language: Language;
  target_language: Language;
  name: string;
  system_prompt: string;
  user_prompt_override: string | null;
  preset: EditingStylePreset | null;
  focus: EditingFocus | null;
  origin: 'seed' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface PromptLabRunParams {
  model?: string;
  temperature?: number;
  sourceLanguage: Language;
  targetLanguage: Language;
  preset?: EditingStylePreset;
  focus?: EditingFocus;
  customInstructions?: string;
  includeGlossary?: boolean;
  chapterNumber?: number;
  chunkSize?: number;
  analysisMaxSectionTokens?: number;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
  forceChunked?: boolean;
  translateQualityPreset?: 'fast' | 'standard' | 'enhanced';
  editQualityPreset?: 'fast' | 'standard' | 'enhanced';
  reasoningEffort?: 'low' | 'medium' | 'high';
  runLabel?: string;
  userPromptOverride?: boolean;
}

export interface PromptLabRunInputSnapshot {
  sourceText: string;
  translatedText?: string;
  glossarySnapshot?: GlossaryImportEntry[];
  systemPrompt: string;
  userPrompt: string;
}

export interface PromptLabRunOutput {
  stage: PromptLabStage;
  success: boolean;
  error?: string;
  text?: string;
  analysis?: AnalysisResult;
  tokensUsed: number;
  durationMs: number;
  prompts: { system: string; user: string };
  apiRequestParams?: Record<string, unknown>;
  translateDebug?: {
    translateQualityPreset?: 'fast' | 'standard' | 'enhanced';
    resolvedFlags: {
      enableFewShot: boolean;
      enableCoT: boolean;
      enableStructuredCoT: boolean;
      leadingContextParagraphs: number;
    };
    llmDefaults: {
      maxTokens: number;
      defaultReasoningEffort?: 'low' | 'medium' | 'high';
      preferJsonObjectOverStructuredSchema: boolean;
    };
    effectiveChunkSize: number;
    chunkingMode?: 'single_shot' | 'chunked';
    chunkingReason?: string;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    effectiveMaxTokens?: number;
    chunkSummaries?: Array<{
      chunkId: string;
      completionPath?: 'structured' | 'json_object' | 'text';
      finishReason?: string;
      error?: string;
    }>;
  };
  editDebug?: {
    editQualityPreset?: 'fast' | 'standard' | 'enhanced';
    editingStylePreset: EditingStylePreset;
    editingFocus: EditingFocus;
    chunkingMode: 'single_shot' | 'chunked';
    chunkingReason: string;
    effectiveChunkSize: number;
    estimatedChunks: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    effectiveMaxTokens: number;
    draftLength: number;
    outputLength?: number;
  };
}

export interface PromptLabRunRow {
  id: string;
  text_id: string | null;
  prompt_id: string | null;
  stage: PromptLabStage;
  display_name: string | null;
  params: PromptLabRunParams;
  input_snapshot: PromptLabRunInputSnapshot;
  output: PromptLabRunOutput;
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

export interface EvaluationIssue {
  paragraphIndex: number;
  dimension: 'accuracy' | 'fluency' | 'glossary' | 'style';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  description: string;
}

export interface VariantEvaluation {
  issues: EvaluationIssue[];
  strengths: string;
}

export interface PromptLabEvaluationResult {
  analysis_scratchpad?: string;
  variant_A?: VariantEvaluation;
  variant_B?: VariantEvaluation;
  verdict?: {
    preferred_variant: 'A' | 'B' | 'TIE';
    justification: string;
    final_polished_version: string;
  };
  /** @deprecated Legacy format — kept for old saved evaluations */
  score?: number;
  dimensions?: {
    accuracy?: number;
    fluency?: number;
    glossary?: number;
    style?: number;
  };
  issues?: Array<{ paragraphIndex?: number; severity?: string; text: string }>;
  suggestions?: string[];
  summary?: string;
}

export interface PromptLabEvaluationRow {
  id: string;
  left_run_id: string | null;
  right_run_id: string | null;
  left_mode: 'source' | 'output';
  right_mode: 'source' | 'output';
  score: number | null;
  result: PromptLabEvaluationResult;
  model: string | null;
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

export function rowToPromptLabText(row: PromptLabTextRow) {
  return {
    id: row.id,
    title: row.title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    stageHint: row.stage_hint,
    content: row.content,
    translatedText: row.translated_text,
    glossarySnapshot: row.glossary_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPromptLabPrompt(row: PromptLabPromptRow) {
  return {
    id: row.id,
    stage: row.stage,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    name: row.name,
    systemPrompt: row.system_prompt,
    userPromptOverride: row.user_prompt_override,
    preset: row.preset,
    focus: row.focus,
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPromptLabRun(row: PromptLabRunRow) {
  return {
    id: row.id,
    textId: row.text_id,
    promptId: row.prompt_id,
    stage: row.stage,
    displayName: row.display_name,
    params: row.params,
    inputSnapshot: row.input_snapshot,
    output: row.output,
    tokensUsed: row.tokens_used,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export function rowToPromptLabEvaluation(row: PromptLabEvaluationRow) {
  return {
    id: row.id,
    leftRunId: row.left_run_id,
    rightRunId: row.right_run_id,
    leftMode: row.left_mode,
    rightMode: row.right_mode,
    score: row.score,
    result: row.result,
    model: row.model,
    tokensUsed: row.tokens_used,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}
