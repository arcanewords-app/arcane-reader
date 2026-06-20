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
  resolvePresetToTranslateOptions,
  type TranslateQualityPreset,
} from '../shared/translate-quality-presets.js';
import {
  resolvePresetToEditOptions,
  type EditQualityPreset,
} from '../shared/edit-quality-presets.js';
import { resolveEditChunkingMode } from '../engine/edit-chunking-policy.js';
import { estimateTokensHeuristic } from '../engine/utils/token-estimate.js';
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
  translateQualityPreset?: TranslateQualityPreset;
  editQualityPreset?: EditQualityPreset;
}

function resolveTranslateRunFlags(input: RunStageInput): {
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
} {
  if (input.translateQualityPreset) {
    const preset = resolvePresetToTranslateOptions(input.translateQualityPreset);
    return {
      enableTranslateFewShot: preset.enableTranslateFewShot,
      enableTranslateCoT: preset.enableTranslateCoT,
      translateLeadingContextParagraphs: preset.translateLeadingContextParagraphs,
      enableTranslateStructuredCoT: input.enableTranslateStructuredCoT,
    };
  }
  return {
    enableTranslateFewShot: input.enableTranslateFewShot,
    enableTranslateCoT: input.enableTranslateCoT,
    enableTranslateStructuredCoT: input.enableTranslateStructuredCoT,
    translateLeadingContextParagraphs: input.translateLeadingContextParagraphs,
    miniModelTranslationProfile: input.miniModelTranslationProfile,
  };
}

export interface ResolvedEditRunOptions {
  editingStylePreset: EditingStylePreset;
  editingFocus: EditingFocus;
  chunkSize?: number;
  forceChunked: boolean;
  forceSingleShot: boolean;
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

export function resolveEditRunOptions(
  input: RunStageInput,
  modelId: string,
  translatedText: string,
  glossaryText: string,
  castText: string
): ResolvedEditRunOptions {
  const preset = input.editQualityPreset ?? 'standard';
  const presetOpts = resolvePresetToEditOptions(preset);
  const editingStylePreset = input.preset ?? presetOpts.editingStylePreset;
  const editingFocus = normalizeEditingFocus(input.focus ?? presetOpts.editingFocus);
  const forceChunked = input.forceChunked === true || presetOpts.forceChunked;

  const chunking = resolveEditChunkingMode({
    translatedText,
    modelId,
    preset,
    glossaryText,
    castText,
    forceChunked,
    forceSingleShot: presetOpts.forceSingleShot,
    chunkSizeOverride: input.chunkSize,
    includeGlossary: input.includeGlossary !== false,
  });

  const forceSingleShot = chunking.mode === 'single_shot' && !forceChunked;
  let chunkSize = input.chunkSize;
  if (chunking.mode === 'chunked' && chunkSize === undefined) {
    chunkSize = chunking.effectiveChunkSize;
  } else if (chunking.mode === 'single_shot') {
    chunkSize = undefined;
  }

  return {
    editingStylePreset,
    editingFocus,
    chunkSize,
    forceChunked,
    forceSingleShot,
  };
}

function estimateEditChunkCount(translatedText: string, chunkSize: number): number {
  const tokens = estimateTokensHeuristic(translatedText);
  if (tokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokens / chunkSize));
}

/** Engine default chunk size when Lab does not override (matches prod mini-aware resolver). */
export const PROMPT_LAB_DEFAULT_CHUNK_SIZE = 2000;

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
    input.stage === 'edit' && input.editQualityPreset
      ? (input.preset ?? resolvePresetToEditOptions(input.editQualityPreset).editingStylePreset)
      : input.preset;
  const effectiveFocus =
    input.stage === 'edit'
      ? input.editQualityPreset
        ? normalizeEditingFocus(
            input.focus ?? resolvePresetToEditOptions(input.editQualityPreset).editingFocus
          )
        : normalizeEditingFocus(input.focus)
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
    const translateFlags = resolveTranslateRunFlags(input);
    const optimizationFlags = resolveTranslateOptimizationFlags({
      enableTranslateFewShot: translateFlags.enableTranslateFewShot,
      enableTranslateCoT: translateFlags.enableTranslateCoT,
      enableTranslateStructuredCoT: translateFlags.enableTranslateStructuredCoT,
      translateLeadingContextParagraphs: translateFlags.translateLeadingContextParagraphs,
      miniModelProfile: translateFlags.miniModelTranslationProfile,
      modelId: model,
      chunkSizeOverride: input.chunkSize,
      includeGlossaryInTranslation: input.includeGlossary !== false,
    });
    const llmDefaults = resolveTranslateLlmDefaults(model, optimizationFlags.enableStructuredCoT);
    const result = await stage.execute(sourceText, {
      context: ctx,
      chunkSize: input.chunkSize,
      temperature: input.temperature ?? 0.7,
      reasoningEffort: input.reasoningEffort,
      includeGlossary: input.includeGlossary !== false,
      customInstructions: input.customInstructions,
      chapterNumber,
      systemPromptOverride: systemPrompt,
      userPromptOverride: userPrompt,
      neverSplitParagraphs: true,
      enableTranslateFewShot: translateFlags.enableTranslateFewShot,
      enableTranslateCoT: translateFlags.enableTranslateCoT,
      enableTranslateStructuredCoT: translateFlags.enableTranslateStructuredCoT,
      translateLeadingContextParagraphs: translateFlags.translateLeadingContextParagraphs,
      miniModelTranslationProfile: translateFlags.miniModelTranslationProfile,
      forceChunked: input.forceChunked,
    });
    return {
      stage: 'translate',
      success: result.success,
      error: result.error,
      text: result.data?.translatedText,
      tokensUsed: result.tokensUsed,
      durationMs: result.duration,
      prompts: { system: systemPrompt, user: userPrompt },
      apiRequestParams,
      translateDebug: {
        translateQualityPreset: input.translateQualityPreset,
        resolvedFlags: optimizationFlags,
        llmDefaults,
        effectiveChunkSize: resolveTranslateChunkSize({
          chunkSizeOverride: input.chunkSize,
          miniModelProfile: translateFlags.miniModelTranslationProfile,
          modelId: model,
          includeGlossaryInTranslation: input.includeGlossary !== false,
        }),
        chunkingMode: result.data?.translateChunking?.mode,
        chunkingReason: result.data?.translateChunking?.reason,
        estimatedInputTokens: result.data?.translateChunking?.estimatedInputTokens,
        estimatedOutputTokens: result.data?.translateChunking?.estimatedOutputTokens,
        effectiveMaxTokens: result.data?.translateChunking?.effectiveMaxTokens,
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
  const editOpts = resolveEditRunOptions(input, model, translatedText, glossaryText, castText);
  const chunkingPreview = resolveEditChunkingMode({
    translatedText,
    modelId: model,
    preset: input.editQualityPreset ?? 'standard',
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

  const estimatedChunks =
    chunkingPreview.mode === 'single_shot'
      ? 1
      : estimateEditChunkCount(translatedText, chunkingPreview.effectiveChunkSize);

  return {
    stage: 'edit',
    success: result.success,
    error: result.error,
    text: result.data?.finalText,
    tokensUsed: result.tokensUsed,
    durationMs: result.duration,
    prompts: { system: systemPrompt, user: userPrompt },
    apiRequestParams,
    editDebug: {
      editQualityPreset: input.editQualityPreset,
      editingStylePreset: editOpts.editingStylePreset,
      editingFocus: editOpts.editingFocus,
      chunkingMode: chunkingPreview.mode,
      chunkingReason: chunkingPreview.reason,
      effectiveChunkSize: chunkingPreview.effectiveChunkSize,
      estimatedChunks,
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
