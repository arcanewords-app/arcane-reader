/**
 * SSOT: resolve translate/edit execution modes and stage options for prod + Prompt Lab.
 */

import type { EditingFocus, EditingStylePreset } from '../prompts/system/editor.js';
import { normalizeEditingFocus } from '../prompts/system/editor.js';
import { resolveEditChunkingMode } from '../edit-chunking-policy.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import {
  filterGlossaryByChapter,
  filterGlossaryForChunk,
  getChapterCastCharacters,
} from '../glossary/glossary-filter.js';
import { languageDisplayName } from '../language.js';
import type { AgentContext } from '../types/agent.js';
import type { Glossary } from '../types/glossary.js';
import {
  defaultEditExecutionModeForModel,
  inferEditExecutionModeFromLegacyParams,
  normalizeEditExecutionMode,
  resolveExecutionModeToEditOptions,
  type EditExecutionMode,
} from '../../shared/edit-execution-modes.js';
import {
  defaultExecutionModeForModel,
  inferExecutionModeFromLegacyParams,
  normalizeTranslateExecutionMode,
  resolveExecutionModeToTranslateOptions,
  type TranslateExecutionMode,
} from '../../shared/translate-execution-modes.js';

/** Shared input for translate/edit mode resolution (project settings, Lab run, or pipeline overrides). */
export interface ExecutionOptionsSource {
  translateExecutionMode?: TranslateExecutionMode | string;
  editExecutionMode?: EditExecutionMode | string;
  /** @deprecated Lab / legacy */
  translateQualityPreset?: string;
  /** @deprecated Lab / legacy */
  editQualityPreset?: string;
  enableTranslateFewShot?: boolean;
  enableTranslateCoT?: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs?: number;
  miniModelTranslationProfile?: boolean;
  forceChunked?: boolean;
  /** Explicit chunk size override (Advanced). */
  chunkSize?: number;
  editingStylePreset?: EditingStylePreset;
  editingFocus?: EditingFocus | string;
  /** Lab alias for editingStylePreset */
  preset?: EditingStylePreset;
  /** Lab alias for editingFocus */
  focus?: EditingFocus | string;
}

export interface ResolvedTranslatePipelineOptions {
  translateExecutionMode: TranslateExecutionMode;
  enableTranslateFewShot: boolean;
  enableTranslateCoT: boolean;
  enableTranslateStructuredCoT?: boolean;
  translateLeadingContextParagraphs: number;
  miniModelTranslationProfile?: boolean;
  forceChunked?: boolean;
  /** Set only when source has explicit chunkSize override. */
  chunkSize?: number;
}

export interface ResolvedEditPipelineOptions {
  editExecutionMode: EditExecutionMode;
  editingStylePreset: EditingStylePreset;
  editingFocus: EditingFocus;
  chunkSize?: number;
  forceChunked: boolean;
  forceSingleShot: boolean;
}

function hasLegacyTranslateFlags(source: ExecutionOptionsSource): boolean {
  return (
    source.enableTranslateCoT === true ||
    source.enableTranslateFewShot === true ||
    source.miniModelTranslationProfile === true ||
    (source.translateLeadingContextParagraphs ?? 0) > 0
  );
}

export function resolveTranslateExecutionMode(
  source: ExecutionOptionsSource,
  modelId: string
): TranslateExecutionMode {
  if (source.translateExecutionMode) {
    return normalizeTranslateExecutionMode(source.translateExecutionMode);
  }
  if (source.translateQualityPreset) {
    return normalizeTranslateExecutionMode(source.translateQualityPreset);
  }
  if (hasLegacyTranslateFlags(source)) {
    return inferExecutionModeFromLegacyParams(source);
  }
  return defaultExecutionModeForModel(modelId);
}

export function resolveEditExecutionMode(
  source: ExecutionOptionsSource,
  modelId: string
): EditExecutionMode {
  if (source.editExecutionMode) {
    return normalizeEditExecutionMode(source.editExecutionMode);
  }
  if (source.editQualityPreset) {
    return normalizeEditExecutionMode(source.editQualityPreset);
  }
  const stylePreset = source.editingStylePreset ?? source.preset;
  if (stylePreset === 'literary' || stylePreset === 'ai_revivification') {
    return inferEditExecutionModeFromLegacyParams({ preset: stylePreset });
  }
  return defaultEditExecutionModeForModel(modelId);
}

export function resolveTranslatePipelineOptions(
  source: ExecutionOptionsSource,
  modelId: string
): ResolvedTranslatePipelineOptions {
  const translateExecutionMode = resolveTranslateExecutionMode(source, modelId);
  const modeOpts = resolveExecutionModeToTranslateOptions(translateExecutionMode);

  return {
    translateExecutionMode,
    enableTranslateFewShot: modeOpts.enableTranslateFewShot,
    enableTranslateCoT: modeOpts.enableTranslateCoT,
    translateLeadingContextParagraphs: modeOpts.translateLeadingContextParagraphs,
    enableTranslateStructuredCoT: source.enableTranslateStructuredCoT,
    miniModelTranslationProfile: source.miniModelTranslationProfile,
    forceChunked: source.forceChunked,
    ...(source.chunkSize != null && source.chunkSize > 0 ? { chunkSize: source.chunkSize } : {}),
  };
}

export function buildEditGlossaryAndCastFromContext(
  context: AgentContext,
  translatedText: string,
  chapterNumber: number,
  includeGlossary: boolean
): { glossaryText: string; castText: string } {
  const targetLabel = languageDisplayName(context.targetLanguage);
  const chapterGlossary = filterGlossaryByChapter(context.glossary as Glossary, chapterNumber);
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

export function resolveEditPipelineOptions(
  source: ExecutionOptionsSource,
  modelId: string,
  translatedText: string,
  glossaryText: string,
  castText: string,
  includeGlossary: boolean
): ResolvedEditPipelineOptions {
  const editExecutionMode = resolveEditExecutionMode(source, modelId);
  const presetOpts = resolveExecutionModeToEditOptions(editExecutionMode);
  const editingStylePreset =
    source.editingStylePreset ?? source.preset ?? presetOpts.editingStylePreset;
  const editingFocus = normalizeEditingFocus(
    source.editingFocus ?? source.focus ?? presetOpts.editingFocus
  );
  const forceChunked = source.forceChunked === true;

  const chunking = resolveEditChunkingMode({
    translatedText,
    modelId,
    executionMode: editExecutionMode,
    glossaryText,
    castText,
    forceChunked,
    forceSingleShot: presetOpts.forceSingleShot,
    chunkSizeOverride: source.chunkSize,
    includeGlossary,
  });

  const forceSingleShot = chunking.mode === 'single_shot' && !forceChunked;
  let chunkSize = source.chunkSize;
  if (chunking.mode === 'chunked' && chunkSize === undefined) {
    chunkSize = chunking.effectiveChunkSize;
  } else if (chunking.mode === 'single_shot') {
    chunkSize = undefined;
  }

  return {
    editExecutionMode,
    editingStylePreset,
    editingFocus,
    chunkSize,
    forceChunked,
    forceSingleShot,
  };
}

/** Map project settings (partial) into execution source for pipeline wiring. */
export function executionSourceFromProjectSettings(
  settings: ExecutionOptionsSource | undefined | null
): ExecutionOptionsSource {
  if (!settings) return {};
  return {
    translateExecutionMode: settings.translateExecutionMode,
    editExecutionMode: settings.editExecutionMode,
    enableTranslateFewShot: settings.enableTranslateFewShot,
    enableTranslateCoT: settings.enableTranslateCoT,
    enableTranslateStructuredCoT: settings.enableTranslateStructuredCoT,
    translateLeadingContextParagraphs: settings.translateLeadingContextParagraphs,
    miniModelTranslationProfile: settings.miniModelTranslationProfile,
    forceChunked: settings.forceChunked,
    chunkSize: settings.chunkSize,
    editingStylePreset: settings.editingStylePreset,
    editingFocus: settings.editingFocus,
  };
}

/** Build execution source from pipeline options (stage 3 edit resolution). */
export function executionSourceFromPipelineOptions(
  options: ExecutionOptionsSource & {
    translateExecutionMode?: TranslateExecutionMode;
    editExecutionMode?: EditExecutionMode;
  }
): ExecutionOptionsSource {
  return {
    translateExecutionMode: options.translateExecutionMode,
    editExecutionMode: options.editExecutionMode,
    enableTranslateFewShot: options.enableTranslateFewShot,
    enableTranslateCoT: options.enableTranslateCoT,
    enableTranslateStructuredCoT: options.enableTranslateStructuredCoT,
    translateLeadingContextParagraphs: options.translateLeadingContextParagraphs,
    miniModelTranslationProfile: options.miniModelTranslationProfile,
    forceChunked: options.forceChunked,
    chunkSize: options.chunkSize,
    editingStylePreset: options.editingStylePreset,
    editingFocus: options.editingFocus,
    preset: options.preset,
    focus: options.focus,
  };
}
