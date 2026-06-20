/**
 * Ephemeral single-stage runner for Prompt Lab (no production DB writes).
 */

import { loadConfig } from '../config.js';
import {
  AnalyzeStage,
  TranslateStage,
  EditStage,
  OpenAIProvider,
  GlossaryManager,
  filterGlossaryByChapter,
  filterGlossaryForChunk,
  getChapterCastCharacters,
  resolvePrompts,
  getEffectiveStagePrompts,
  createEditorPrompt,
  languageDisplayName,
  assertSupportedPair,
  prepareTranslateSourceText,
  type Language,
  type StageType,
} from '../engine/index.js';
import type { GlossaryImportEntry } from '../api/schemas/glossary.js';
import type { EditingFocus, EditingStylePreset } from '../engine/prompts/system/editor.js';
import { normalizeEditingFocus } from '../engine/prompts/system/editor.js';
import { createLabAgentContext, portableEntriesToGlossary } from './glossary.js';
import type { PromptLabRunInputSnapshot, PromptLabRunOutput } from './types.js';
import {
  describeSanitizedRequestParams,
  resolveTranslateLlmDefaults,
  type ReasoningEffort,
} from '../shared/openaiModelAdapter.js';
import {
  resolveTranslateChunkSize,
  resolveTranslateOptimizationFlags,
} from '../engine/translate-optimization.js';
import {
  resolveEditExecutionMode,
  resolveEditPipelineOptions,
  resolveTranslatePipelineOptions,
  type ResolvedEditPipelineOptions,
} from '../engine/pipeline/resolve-execution-options.js';
import {
  resolveExecutionModeToEditOptions,
  type EditExecutionMode,
} from '../shared/edit-execution-modes.js';
import type { TranslateExecutionMode } from '../shared/translate-execution-modes.js';
import { resolveEditChunkingMode } from '../engine/edit-chunking-policy.js';
import { chunkText } from '../engine/utils/chunker.js';
import { normalizeLabTranslatedText } from '../engine/utils/para-markers.js';
import { DEFAULT_TRANSLATION_CHUNK_SIZE } from '../shared/translationChunkPresets.js';
import { TRANSLATE_COT_JSON_SCHEMA } from '../engine/prompts/shared/translate-cot.js';

export interface PreviewUserPromptInput {
  stage: StageType;
  sourceLanguage: Language;
  targetLanguage: Language;
  sourceText: string;
  translatedText?: string;
  glossarySnapshot?: GlossaryImportEntry[];
  chapterNumber?: number;
  includeGlossary?: boolean;
  customInstructions?: string;
  preset?: EditingStylePreset;
  focus?: EditingFocus;
}

export interface RunStageInput extends PreviewUserPromptInput {
  model?: string;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  systemPromptOverride?: string;
  userPromptOverride?: string;
  /** Max tokens per translate chunk (default: engine resolves from model). */
  chunkSize?: number;
  analysisMaxSectionTokens?: number;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
  forceChunked?: boolean;
  translateExecutionMode?: TranslateExecutionMode;
  editExecutionMode?: EditExecutionMode;
  /** @deprecated Use translateExecutionMode */
  translateQualityPreset?: TranslateExecutionMode | 'fast' | 'standard' | 'enhanced';
  /** @deprecated Use editExecutionMode */
  editQualityPreset?: EditExecutionMode | 'fast' | 'standard' | 'enhanced';
}

export type ResolvedEditRunOptions = ResolvedEditPipelineOptions;

export function resolveEditRunOptions(
  input: RunStageInput,
  modelId: string,
  translatedText: string,
  glossaryText: string,
  castText: string
): ResolvedEditRunOptions {
  return resolveEditPipelineOptions(
    input,
    modelId,
    translatedText,
    glossaryText,
    castText,
    input.includeGlossary !== false
  );
}

function buildEditGlossaryAndCast(
  input: PreviewUserPromptInput,
  translatedText: string
): { glossaryText: string; castText: string } {
  const glossary = portableEntriesToGlossary(input.glossarySnapshot);
  const chapterNumber = input.chapterNumber ?? 1;
  const targetLabel = languageDisplayName(input.targetLanguage);
  const includeGlossary = input.includeGlossary !== false;
  const chapterGlossary = filterGlossaryByChapter(glossary, chapterNumber);
  const glossaryText =
    includeGlossary && chapterGlossary
      ? new GlossaryManager(
          filterGlossaryForChunk(translatedText, chapterGlossary, 'target')
        ).toEditPromptText({ targetLanguageLabel: targetLabel })
      : '';
  const castText = GlossaryManager.toEditCastPromptText(
    getChapterCastCharacters(chapterGlossary, chapterNumber)
  );
  return { glossaryText, castText };
}

function estimateEditChunkCount(translatedText: string, chunkSize: number): number {
  const trimmed = translatedText.trim();
  if (!trimmed || chunkSize <= 0) return 0;
  return chunkText(trimmed, {
    maxTokens: chunkSize,
    preserveParagraphs: true,
    neverSplitParagraphs: true,
  }).length;
}

/** Engine default chunk size when Lab does not override (matches prod config). */
export const PROMPT_LAB_DEFAULT_CHUNK_SIZE = DEFAULT_TRANSLATION_CHUNK_SIZE;

function resolveTranslateSourceText(sourceText: string): string {
  return sourceText.trim() ? prepareTranslateSourceText(sourceText) : sourceText;
}

function defaultTemperatureForStage(stage: StageType): number {
  if (stage === 'analyze') return 0.3;
  if (stage === 'translate') return 0.7;
  return 0.5;
}

function labResponseFormat(input: RunStageInput):
  | 'text'
  | 'json_object'
  | {
      type: 'json_schema';
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    } {
  if (input.stage === 'analyze') return 'json_object';
  if (input.stage === 'translate') {
    if (input.enableTranslateStructuredCoT) {
      return {
        type: 'json_schema',
        json_schema: {
          name: 'translate_cot_response',
          strict: true,
          schema: TRANSLATE_COT_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      };
    }
    return 'json_object';
  }
  return 'text';
}

export function buildLabApiRequestParams(
  input: RunStageInput,
  model: string,
  prompts: { system: string; user: string }
): Record<string, unknown> {
  const defaultTemperature = defaultTemperatureForStage(input.stage);
  const structuredCoT = input.enableTranslateStructuredCoT === true;
  const maxTokens =
    input.stage === 'analyze'
      ? 4096
      : input.stage === 'translate'
        ? resolveTranslateLlmDefaults(model, structuredCoT).maxTokens
        : 8192;
  return describeSanitizedRequestParams({
    model,
    messages: [
      { role: 'system', content: prompts.system },
      { role: 'user', content: prompts.user },
    ],
    options: {
      temperature: input.temperature ?? defaultTemperature,
      maxTokens,
      reasoningEffort: input.reasoningEffort,
    },
    defaultTemperature,
    responseFormat: labResponseFormat(input),
  });
}

export function previewUserPrompt(input: PreviewUserPromptInput): string {
  assertSupportedPair(input.sourceLanguage, input.targetLanguage);
  const glossary = portableEntriesToGlossary(input.glossarySnapshot);
  const chapterNumber = input.chapterNumber ?? 1;
  const includeGlossary = input.includeGlossary !== false;
  const targetLabel = languageDisplayName(input.targetLanguage);

  if (input.stage === 'analyze') {
    let glossaryText = '';
    if (includeGlossary && glossary) {
      glossaryText = new GlossaryManager(glossary).toPromptText({
        targetLanguageLabel: targetLabel,
      });
    }
    return resolvePrompts('analyze', input.sourceLanguage, input.targetLanguage).createUserPrompt({
      sourceText: input.sourceText,
      sourceLanguageLabel: languageDisplayName(input.sourceLanguage),
      targetLanguageLabel: targetLabel,
      existingGlossary: glossaryText || undefined,
    });
  }

  if (input.stage === 'translate') {
    const effectiveSourceText = resolveTranslateSourceText(input.sourceText);
    const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
    const chapterGlossary = filterGlossaryByChapter(ctx.glossary, chapterNumber);
    const glossaryText =
      includeGlossary && chapterGlossary
        ? new GlossaryManager(
            filterGlossaryForChunk(effectiveSourceText, chapterGlossary, 'source')
          ).toPromptText({ targetLanguageLabel: targetLabel })
        : '';
    const cast = GlossaryManager.toCastPromptText(
      getChapterCastCharacters(chapterGlossary, chapterNumber)
    );
    const contextParts: string[] = [];
    if (cast) contextParts.push(cast);
    return resolvePrompts('translate', input.sourceLanguage, input.targetLanguage).createUserPrompt(
      {
        sourceText: effectiveSourceText,
        sourceLanguageLabel: languageDisplayName(input.sourceLanguage),
        targetLanguageLabel: targetLabel,
        glossary: glossaryText,
        context: contextParts.join('\n'),
        styleGuide: '',
        customInstructions: input.customInstructions,
      }
    );
  }

  const chapterGlossary = filterGlossaryByChapter(glossary, chapterNumber);
  const translated = input.translatedText ?? '';
  const glossaryText =
    includeGlossary && chapterGlossary
      ? new GlossaryManager(
          filterGlossaryForChunk(translated, chapterGlossary, 'target')
        ).toEditPromptText({ targetLanguageLabel: targetLabel })
      : '';
  const chapterCast = GlossaryManager.toEditCastPromptText(
    getChapterCastCharacters(chapterGlossary, chapterNumber)
  );
  return createEditorPrompt(
    translated,
    glossaryText,
    '',
    input.customInstructions,
    targetLabel,
    chapterCast
  );
}

export async function runPromptLabStage(input: RunStageInput): Promise<PromptLabRunOutput> {
  assertSupportedPair(input.sourceLanguage, input.targetLanguage);

  const appConfig = loadConfig();
  const model = input.model?.trim() || appConfig.openai.model;
  const provider = new OpenAIProvider({ apiKey: appConfig.openai.apiKey, model });

  const effectivePreset =
    input.stage === 'edit'
      ? (input.preset ??
        resolveExecutionModeToEditOptions(resolveEditExecutionMode(input, model))
          .editingStylePreset)
      : input.preset;
  const effectiveFocus =
    input.stage === 'edit'
      ? normalizeEditingFocus(
          input.focus ??
            resolveExecutionModeToEditOptions(resolveEditExecutionMode(input, model)).editingFocus
        )
      : input.focus;

  const effective = getEffectiveStagePrompts(
    input.stage,
    input.sourceLanguage,
    input.targetLanguage,
    {
      preset: effectivePreset,
      focus: effectiveFocus,
    }
  );
  const systemPrompt = input.systemPromptOverride ?? effective.systemPrompt;
  const defaultUser = previewUserPrompt(input);
  const userPrompt = input.userPromptOverride ?? defaultUser;

  const glossary = portableEntriesToGlossary(input.glossarySnapshot);
  const chapterNumber = input.chapterNumber ?? 1;
  const apiRequestParams = buildLabApiRequestParams(input, model, {
    system: systemPrompt,
    user: userPrompt,
  });

  if (input.stage === 'analyze') {
    const stage = new AnalyzeStage(provider);
    const result = await stage.execute(input.sourceText, {
      chapterNumber,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      existingGlossary: input.includeGlossary !== false ? glossary : undefined,
      temperature: input.temperature ?? 0.3,
      reasoningEffort: input.reasoningEffort,
      maxSectionTokens: input.analysisMaxSectionTokens ?? 0,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPrompt,
    });
    return {
      stage: 'analyze',
      success: result.success,
      error: result.error,
      analysis: result.data,
      tokensUsed: result.tokensUsed,
      durationMs: result.duration,
      prompts: { system: systemPrompt, user: userPrompt },
      apiRequestParams,
    };
  }

  if (input.stage === 'translate') {
    const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
    const stage = new TranslateStage(provider);
    const sourceText = resolveTranslateSourceText(input.sourceText);
    const translateOpts = resolveTranslatePipelineOptions(input, model);
    const optimizationFlags = resolveTranslateOptimizationFlags({
      enableTranslateFewShot: translateOpts.enableTranslateFewShot,
      enableTranslateCoT: translateOpts.enableTranslateCoT,
      enableTranslateStructuredCoT: translateOpts.enableTranslateStructuredCoT,
      translateLeadingContextParagraphs: translateOpts.translateLeadingContextParagraphs,
      miniModelProfile: translateOpts.miniModelTranslationProfile,
      modelId: model,
      chunkSizeOverride: input.chunkSize,
      includeGlossaryInTranslation: input.includeGlossary !== false,
      executionMode: translateOpts.translateExecutionMode,
    });
    const llmDefaults = resolveTranslateLlmDefaults(model, optimizationFlags.enableStructuredCoT);
    const result = await stage.execute(sourceText, {
      context: ctx,
      ...(input.chunkSize != null && input.chunkSize > 0 ? { chunkSize: input.chunkSize } : {}),
      temperature: input.temperature ?? 0.7,
      reasoningEffort: input.reasoningEffort,
      includeGlossary: input.includeGlossary !== false,
      customInstructions: input.customInstructions,
      chapterNumber,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPrompt,
      neverSplitParagraphs: true,
      enableTranslateFewShot: translateOpts.enableTranslateFewShot,
      enableTranslateCoT: translateOpts.enableTranslateCoT,
      enableTranslateStructuredCoT: translateOpts.enableTranslateStructuredCoT,
      translateLeadingContextParagraphs: translateOpts.translateLeadingContextParagraphs,
      miniModelTranslationProfile: translateOpts.miniModelTranslationProfile,
      translateExecutionMode: translateOpts.translateExecutionMode,
      forceChunked: input.forceChunked,
    });
    const chunking = result.data?.translateChunking;
    return {
      stage: 'translate',
      success: result.success,
      error: result.error,
      text: result.data?.translatedText
        ? normalizeLabTranslatedText(result.data.translatedText)
        : undefined,
      tokensUsed: result.tokensUsed,
      durationMs: result.duration,
      prompts: { system: systemPrompt, user: userPrompt },
      apiRequestParams,
      translateDebug: {
        translateExecutionMode: translateOpts.translateExecutionMode,
        resolvedFlags: optimizationFlags,
        llmDefaults,
        effectiveChunkSize: resolveTranslateChunkSize({
          chunkSizeOverride: input.chunkSize,
          miniModelProfile: translateOpts.miniModelTranslationProfile,
          modelId: model,
          includeGlossaryInTranslation: input.includeGlossary !== false,
          executionMode: translateOpts.translateExecutionMode,
          chunkingMode: chunking?.mode,
        }),
        chunkingMode: chunking?.mode,
        chunkingReason: chunking?.reason,
        chunkSizeTier: chunking?.chunkSizeTier,
        actualChunks: result.data?.chunkResults.length,
        estimatedInputTokens: chunking?.estimatedInputTokens,
        estimatedOutputTokens: chunking?.estimatedOutputTokens,
        effectiveMaxTokens: chunking?.effectiveMaxTokens,
        chunkSummaries: result.data?.chunkResults.map((c) => ({
          chunkId: c.chunkId,
          completionPath: c.completionPath,
          finishReason: c.finishReason,
          error: c.error,
        })),
      },
    };
  }

  const translatedText = input.translatedText?.trim() ?? '';
  if (!translatedText) {
    return {
      stage: 'edit',
      success: false,
      error: 'translatedText is required for edit stage',
      tokensUsed: 0,
      durationMs: 0,
      prompts: { system: systemPrompt, user: userPrompt },
      apiRequestParams,
    };
  }

  const ctx = createLabAgentContext(input.sourceLanguage, input.targetLanguage, glossary);
  const { glossaryText, castText } = buildEditGlossaryAndCast(input, translatedText);
  const editExecutionMode = resolveEditExecutionMode(input, model);
  const editOpts = resolveEditRunOptions(input, model, translatedText, glossaryText, castText);
  const chunkingPreview = resolveEditChunkingMode({
    translatedText,
    modelId: model,
    executionMode: editExecutionMode,
    glossaryText,
    castText,
    forceChunked: editOpts.forceChunked,
    forceSingleShot: editOpts.forceSingleShot,
    chunkSizeOverride: input.chunkSize,
    includeGlossary: input.includeGlossary !== false,
  });
  const stage = new EditStage(provider);
  const result = await stage.execute(translatedText, input.sourceText ?? '', {
    context: ctx,
    temperature: input.temperature ?? 0.5,
    reasoningEffort: input.reasoningEffort,
    includeGlossary: input.includeGlossary !== false,
    customInstructions: input.customInstructions,
    editingStylePreset: editOpts.editingStylePreset,
    editingFocus: editOpts.editingFocus,
    chunkSize: editOpts.chunkSize,
    forceChunked: editOpts.forceChunked,
    forceSingleShot: editOpts.forceSingleShot,
    chapterNumber,
    systemPromptOverride: systemPrompt,
    userPromptOverride: userPrompt,
  });

  return {
    stage: 'edit',
    success: result.success,
    error: result.error,
    text: result.data?.finalText ? normalizeLabTranslatedText(result.data.finalText) : undefined,
    tokensUsed: result.tokensUsed,
    durationMs: result.duration,
    prompts: { system: systemPrompt, user: userPrompt },
    apiRequestParams,
    editDebug: {
      editExecutionMode,
      editingStylePreset: editOpts.editingStylePreset,
      editingFocus: editOpts.editingFocus,
      chunkingMode: chunkingPreview.mode,
      chunkingReason: chunkingPreview.reason,
      chunkSizeTier: chunkingPreview.chunkSizeTier,
      effectiveChunkSize: chunkingPreview.effectiveChunkSize,
      estimatedChunks:
        chunkingPreview.mode === 'single_shot'
          ? 1
          : estimateEditChunkCount(translatedText, chunkingPreview.effectiveChunkSize),
      actualChunks:
        chunkingPreview.mode === 'single_shot'
          ? 1
          : estimateEditChunkCount(translatedText, chunkingPreview.effectiveChunkSize),
      estimatedInputTokens: chunkingPreview.estimatedInputTokens,
      estimatedOutputTokens: chunkingPreview.estimatedOutputTokens,
      effectiveMaxTokens: chunkingPreview.effectiveMaxTokens,
      draftLength: translatedText.length,
      outputLength: result.data?.finalText?.length,
    },
  };
}

export function buildInputSnapshot(
  input: RunStageInput,
  prompts: { system: string; user: string }
): PromptLabRunInputSnapshot {
  const sourceText =
    input.stage === 'translate' ? resolveTranslateSourceText(input.sourceText) : input.sourceText;
  return {
    sourceText,
    translatedText: input.translatedText,
    glossarySnapshot: input.glossarySnapshot,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
  };
}
