/**
 * Engine Integration - подключение arcane-engine к arcane-reader
 *
 * Использует TranslationPipeline, NovelAgent и промпты из engine
 */

import {
  TranslationPipeline,
  OpenAIProvider,
  NovelAgent,
  createGlossaryPromptSection,
  chunkText,
  translateAndDeclineName,
  declineName,
  parseProjectLanguage,
  parseProjectLanguagePair,
  assertSupportedPair,
  isLatinScriptName,
  resolvePrompts,
  type PipelineOptions,
  type Glossary,
  type Gender,
  type Declensions,
  type Language,
  normalizeEditingFocus,
  executionSourceFromProjectSettings,
  resolveTranslatePipelineOptions,
  resolveEditExecutionMode,
} from '../engine/index.js';
import { isReasoningModel } from '../shared/openaiModelAdapter.js';
import { clampStageModelForRole } from '../shared/modelAccess.js';
import type { UserRole } from '../types/roles.js';
import { isChunkError } from '../shared/chunkErrors.js';
import { getCachedAnalysisResult, setCachedAnalysisResult } from './analysisCache.js';

import type { AppConfig } from '../config.js';
import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  GlossaryEntry,
} from '../storage/database.js';
import { logger } from '../logger.js';

// Cache for NovelAgents per project and language pair
const agentCache = new Map<string, NovelAgent>();

export type LanguagePairOverride = {
  sourceLanguage: string;
  targetLanguage: string;
};

function agentCacheKey(
  projectId: string,
  sourceLanguage: Language,
  targetLanguage: Language
): string {
  return `${projectId}:${sourceLanguage}:${targetLanguage}`;
}

/** Resolve project default or ephemeral job override into a validated language pair. */
export function resolveEffectiveLanguagePair(
  project: Project | ProjectWithChapterList,
  override?: Partial<LanguagePairOverride>
): { sourceLanguage: Language; targetLanguage: Language } {
  if (override?.sourceLanguage && override?.targetLanguage) {
    const sourceLanguage = parseProjectLanguage(override.sourceLanguage, 'source');
    const targetLanguage = parseProjectLanguage(override.targetLanguage, 'target');
    assertSupportedPair(sourceLanguage, targetLanguage);
    return { sourceLanguage, targetLanguage };
  }
  return parseProjectLanguagePair(project.sourceLanguage, project.targetLanguage);
}

function minimalDeclensions(name: string): Declensions {
  return {
    nominative: name,
    genitive: name,
    dative: name,
    accusative: name,
    instrumental: name,
    prepositional: name,
  };
}

function loadCharacterFromGlossaryEntry(
  entry: GlossaryEntry,
  targetLanguage: Language
): {
  translatedName: string;
  declensions: Declensions;
  gender: Gender;
} {
  const gender = (entry.gender as Gender) || 'unknown';
  const useRussianDeclension = targetLanguage === 'ru';

  if (entry.translated) {
    return {
      translatedName: entry.translated,
      declensions:
        entry.declensions ??
        (useRussianDeclension
          ? declineName(entry.translated, gender)
          : minimalDeclensions(entry.translated)),
      gender,
    };
  }
  if (useRussianDeclension && isLatinScriptName(entry.original)) {
    const result = translateAndDeclineName(entry.original, gender);
    return {
      translatedName: result.translatedName,
      declensions: result.declensions,
      gender: result.gender,
    };
  }
  return {
    translatedName: entry.original,
    declensions: entry.declensions ?? minimalDeclensions(entry.original),
    gender,
  };
}

/**
 * Get or create NovelAgent for a project (optionally with ephemeral language pair override).
 */
export function getAgentForProject(
  project: Project | ProjectWithChapterList,
  languagePair?: Partial<LanguagePairOverride>
): NovelAgent {
  const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(project, languagePair);
  const cacheKey = agentCacheKey(project.id, sourceLanguage, targetLanguage);
  let agent = agentCache.get(cacheKey);

  if (!agent) {
    agent = NovelAgent.create({
      novelId: project.id,
      title: project.name,
      sourceLanguage,
      targetLanguage,
    });

    // Load existing glossary into agent
    const glossaryManager = agent.glossary as unknown as Glossary;
    for (const entry of project.glossary) {
      if (entry.type === 'character') {
        const { translatedName, declensions, gender } = loadCharacterFromGlossaryEntry(
          entry,
          targetLanguage
        );

        glossaryManager.characters.push({
          id: entry.id,
          originalName: entry.original,
          translatedName,
          declensions,
          gender,
          description: entry.description || '',
          aliases: [],
          firstAppearance: entry.firstAppearance || 1,
          isMainCharacter: false,
          mentionedInChapters: entry.mentionedInChapters,
        });
      } else if (entry.type === 'location') {
        glossaryManager.locations.push({
          id: entry.id,
          originalName: entry.original,
          translatedName: entry.translated,
          description: entry.description || '',
          type: 'other',
          mentionedInChapters: entry.mentionedInChapters,
        });
      } else if (entry.type === 'term') {
        glossaryManager.terms.push({
          id: entry.id,
          originalTerm: entry.original,
          translatedTerm: entry.translated,
          description: entry.description || '',
          category: 'other',
          mentionedInChapters: entry.mentionedInChapters,
        });
      }
    }

    agentCache.set(cacheKey, agent);
  }

  return agent;
}

/**
 * Get model for a specific stage, with fallbacks
 */
export function getStageModel(
  project: Project | ProjectWithChapterList,
  stage: 'analysis' | 'translation' | 'editing',
  defaultModel: string,
  userRole?: UserRole
): string {
  const stageModels = project.settings?.stageModels;
  const stageModel = stageModels?.[stage];
  let resolved: string;
  if (stageModel && typeof stageModel === 'string' && stageModel.trim()) {
    resolved = stageModel;
  } else if (project.settings?.model) {
    resolved = project.settings.model;
  } else {
    resolved = defaultModel;
  }
  if (userRole) {
    return clampStageModelForRole(resolved, stage, userRole);
  }
  return resolved;
}

/** Models that only support v1/responses (not chat/completions). Fallback for old saved settings. */
const RESPONSES_ONLY_MODELS = new Set(['gpt-5.1-codex-mini', 'codex-mini-latest']);
const FALLBACK_MODEL = 'gpt-4.1-mini';

function modelForChatCompletions(id: string): string {
  return RESPONSES_ONLY_MODELS.has(id) ? FALLBACK_MODEL : id;
}

/**
 * Create translation pipeline for a project
 */
export function createPipeline(
  config: AppConfig,
  project: Project | ProjectWithChapterList,
  languagePair?: Partial<LanguagePairOverride>,
  userRole?: UserRole
): TranslationPipeline {
  // Validate API key
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const rawAnalysisModel = modelForChatCompletions(
    getStageModel(project, 'analysis', 'gpt-4.1-mini', userRole)
  );
  const allowReasoning = project.settings?.allowReasoningModelsForAnalysis === true;
  const analysisModel =
    isReasoningModel(rawAnalysisModel) && !allowReasoning ? 'gpt-4.1-mini' : rawAnalysisModel;
  if (rawAnalysisModel !== analysisModel && isReasoningModel(rawAnalysisModel)) {
    logger.debug(
      { rawAnalysisModel, analysisModel },
      'Analysis: reasoning model not allowed (allowReasoningModelsForAnalysis=false), using fallback'
    );
  }
  if (allowReasoning && isReasoningModel(rawAnalysisModel)) {
    logger.info(
      { model: rawAnalysisModel },
      'Analysis: reasoning model allowed; first response may take 1–5 minutes'
    );
  }

  const translationModel = modelForChatCompletions(
    getStageModel(project, 'translation', 'gpt-4.1-mini', userRole) || config.openai.model
  );
  const editingModel = modelForChatCompletions(
    getStageModel(project, 'editing', 'gpt-4.1-mini', userRole)
  );

  logger.debug(
    { analysisModel, translationModel, editingModel, hasApiKey: !!config.openai.apiKey },
    'Creating pipeline providers'
  );

  let analysisProvider: OpenAIProvider;
  let translationProvider: OpenAIProvider;
  let editingProvider: OpenAIProvider;

  const openaiTimeout = config.openai.timeout ?? 600000;
  const openaiMaxRetries = config.openai.maxRetries ?? 3;

  try {
    // Analysis = one request per chapter (no chunking). Timeout should allow for slow/reasoning models.
    analysisProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: analysisModel,
      timeout: openaiTimeout,
      maxRetries: openaiMaxRetries,
    });
    logger.debug('Analysis provider created');
  } catch (error) {
    logger.error({ err: error }, 'Failed to create analysis provider');
    throw new Error(
      `Failed to create analysis provider: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  try {
    // Translation = per-chunk requests; timeout applies to each chunk.
    translationProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: translationModel,
      timeout: openaiTimeout,
      maxRetries: openaiMaxRetries,
    });
    logger.debug('Translation provider created');
  } catch (error) {
    logger.error({ err: error }, 'Failed to create translation provider');
    throw new Error(
      `Failed to create translation provider: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  try {
    // Editing = per-chunk requests; timeout applies to each chunk.
    editingProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: editingModel,
      timeout: openaiTimeout,
      maxRetries: openaiMaxRetries,
    });
    logger.debug('Editing provider created');
  } catch (error) {
    logger.error({ err: error }, 'Failed to create editing provider');
    throw new Error(
      `Failed to create editing provider: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  const providers = {
    analysis: analysisProvider,
    translation: translationProvider,
    editing: editingProvider,
  };

  // Validate providers were created
  if (!providers.analysis || !providers.translation || !providers.editing) {
    logger.error(
      {
        analysis: !!providers.analysis,
        translation: !!providers.translation,
        editing: !!providers.editing,
      },
      'Provider validation failed'
    );
    throw new Error('Failed to create LLM providers');
  }

  // Validate providers have required methods
  if (typeof providers.analysis.completeJSON !== 'function') {
    throw new Error(
      'Analysis provider is missing completeJSON method (needed for structured output)'
    );
  }
  if (typeof providers.translation.complete !== 'function') {
    throw new Error('Translation provider is missing complete method');
  }
  if (typeof providers.editing.complete !== 'function') {
    throw new Error('Editing provider is missing complete method');
  }
  // Editing stage also needs completeJSON for quality check (optional)
  if (typeof providers.editing.completeJSON !== 'function') {
    logger.warn('Editing provider missing completeJSON - quality check will be skipped');
  }

  const agent = getAgentForProject(project, languagePair);

  logger.debug(
    {
      hasAnalysis: !!providers.analysis,
      analysisModel: (providers.analysis as { model?: string })?.model,
      hasTranslation: !!providers.translation,
      translationModel: (providers.translation as { model?: string })?.model,
      hasEditing: !!providers.editing,
      editingModel: (providers.editing as { model?: string })?.model,
      hasAgent: !!agent,
    },
    'Creating TranslationPipeline with providers'
  );

  try {
    const pipeline = new TranslationPipeline({
      providers,
      agent,
    });

    logger.debug('TranslationPipeline created successfully');
    return pipeline;
  } catch (error) {
    logger.error({ err: error }, 'Failed to create TranslationPipeline');
    throw error;
  }
}

/** Options for translateChapterWithPipeline (stages from API) */
export type TranslatePipelineOptions = PipelineOptions & {
  stages?: ('analysis' | 'translation' | 'editing')[] | 'all';
  existingTranslatedText?: string;
  includeGlossaryInAnalysis?: boolean;
  includeGlossaryInTranslation?: boolean;
  includeGlossaryInEditing?: boolean;
  /** Ephemeral language pair override for this translation run. */
  languagePair?: Partial<LanguagePairOverride>;
  /** Called when chunk progress updates (for UI). */
  onProgress?: (chunksDone: number, totalChunks: number, stage?: string) => void;
  /** User role for model access clamping. */
  userRole?: UserRole;
};

/**
 * Translate chapter using the full pipeline.
 * Stages are passed from the API (stages param); glossary is loaded from project
 * and updated after analysis; agent cache is keyed by project id.
 */
export async function translateChapterWithPipeline(
  config: AppConfig,
  project: Project | ProjectWithChapterList,
  chapter: Chapter,
  options: TranslatePipelineOptions = {}
): Promise<{
  translatedText: string;
  tokensUsed: number;
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  };
  duration: number;
  glossaryUpdates?: GlossaryEntry[];
  /** Updates for existing glossary entries (id + partial fields from analysis) */
  glossaryUpdatesExisting?: Array<{
    id: string;
    updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
  }>;
  /** Entry IDs that appeared in this chapter (for merging chapter into mentionedInChapters) */
  glossaryAppearanceEntryIds?: string[];
  /** When true, user cancelled after stage 1; server should save glossary and set status to pending. */
  cancelled?: boolean;
  /** Number of translation chunks (for translationMeta). */
  chunksCount?: number;
  /** Index of first failed chunk (0-based), or -1 if none (for translationMeta). */
  failedChunkIndex?: number;
}> {
  try {
    const pipeline = createPipeline(config, project, options.languagePair, options.userRole);
    const stages = options.stages ?? 'all';

    const fallbackTemp = project.settings.temperature ?? config.translation?.temperature ?? 0.5;
    const translationModel = getStageModel(
      project,
      'translation',
      config.openai.model || 'gpt-4.1-mini',
      options.userRole
    );
    const editingModel = getStageModel(project, 'editing', 'gpt-4.1-mini', options.userRole);
    const executionSource = executionSourceFromProjectSettings(project.settings);
    const translateOpts = resolveTranslatePipelineOptions(executionSource, translationModel);
    const editExecutionMode = resolveEditExecutionMode(executionSource, editingModel);

    const pipelineOpts: PipelineOptions = {
      ...(translateOpts.chunkSize != null ? { chunkSize: translateOpts.chunkSize } : {}),
      temperatureByStage: {
        analysis: project.settings.temperatureByStage?.analysis ?? fallbackTemp,
        translation: project.settings.temperatureByStage?.translation ?? fallbackTemp,
        editing: project.settings.temperatureByStage?.editing ?? fallbackTemp,
      },
      neverSplitParagraphs: config.translation.neverSplitParagraphs,
      retryAttempts: config.translation.chunkRetryAttempts,
      chunkRetryDelayMs: config.translation.chunkRetryDelayMs,
      parallelChunks: config.translation.parallelChunks,
      analysisMaxSectionTokens: config.translation.analysisMaxSectionTokens,
      includeGlossaryInAnalysis:
        options.includeGlossaryInAnalysis ?? project.settings?.includeGlossaryInAnalysis ?? true,
      includeGlossaryInTranslation:
        options.includeGlossaryInTranslation ??
        project.settings?.includeGlossaryInTranslation ??
        true,
      includeGlossaryInEditing:
        options.includeGlossaryInEditing ?? project.settings?.includeGlossaryInEditing ?? true,
      translateExecutionMode: translateOpts.translateExecutionMode,
      editExecutionMode,
      enableTranslateFewShot: translateOpts.enableTranslateFewShot,
      enableTranslateCoT: translateOpts.enableTranslateCoT,
      enableTranslateStructuredCoT: translateOpts.enableTranslateStructuredCoT,
      translateLeadingContextParagraphs: translateOpts.translateLeadingContextParagraphs,
      miniModelTranslationProfile: translateOpts.miniModelTranslationProfile,
      forceChunked: translateOpts.forceChunked,
      ...(options.isCancelled && { isCancelled: options.isCancelled }),
      ...(project.settings?.includeTextBlockTypesInTranslation === true &&
        project.settings?.textBlockTypes?.length && {
          textBlockTypes: project.settings.textBlockTypes.filter((bt) => bt.enabled),
        }),
      ...(project.settings?.customInstructions && {
        customInstructions: project.settings.customInstructions,
      }),
      editingStylePreset: project.settings.editingStylePreset ?? 'default',
      editingFocus: normalizeEditingFocus(project.settings.editingFocus),
      ...(options.onProgress && { onProgress: options.onProgress }),
    };
    if (Array.isArray(stages)) {
      pipelineOpts.runStages = stages;
      if (stages.includes('editing') && !stages.includes('translation')) {
        pipelineOpts.existingTranslatedTextForEdit =
          options.existingTranslatedText ?? chapter.translatedText?.trim() ?? '';
      }
    } else if (stages === 'all') {
      pipelineOpts.skipAnalysis = options.skipAnalysis ?? false;
      pipelineOpts.skipEditing = options.skipEditing ?? config.translation.skipEditing;
    }

    const sourceText = (chapter.originalText ?? '').trim();
    if (!sourceText) {
      throw new Error('Chapter has no original text to process. Add or re-import chapter content.');
    }
    logger.info(
      { stages, sourceTextLength: sourceText.length },
      'Engine: starting TranslationPipeline'
    );
    const result = await pipeline.translateChapter(sourceText, chapter.number, pipelineOpts);

    // Cancelled after stage 1: return partial result so server can save glossary (refactor 2.2)
    if (result.cancelled) {
      const glossaryUpdates: GlossaryEntry[] = [];
      const glossaryUpdatesExisting: Array<{
        id: string;
        updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
      }> = [];
      let glossaryAppearanceEntryIds: string[] = [];
      if (result.stage1.success && result.stage1.data) {
        const analysis = result.stage1.data;
        const glossaryUpdate = analysis.glossaryUpdate;
        const chapterNum = chapter.number;
        const byShortFormCancel = (name: string, type: 'character' | 'location' | 'term') => {
          const n = name.trim().toLowerCase();
          if (n.length < 2) return undefined;
          return project.glossary.find(
            (e) =>
              e.type === type &&
              e.original
                .trim()
                .toLowerCase()
                .startsWith(n + ' ')
          );
        };
        const newCharactersFilteredCancel = glossaryUpdate.newCharacters.filter(
          (c) => !byShortFormCancel(c.originalName, 'character')
        );
        const newLocationsFilteredCancel = glossaryUpdate.newLocations.filter(
          (l) => !byShortFormCancel(l.originalName, 'location')
        );
        const newTermsFilteredCancel = glossaryUpdate.newTerms.filter(
          (t) => !byShortFormCancel(t.originalTerm, 'term')
        );
        const newCharacters = newCharactersFilteredCancel.map((c, idx) => ({
          id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
          type: 'character' as const,
          original: c.originalName,
          translated: c.translatedName,
          description: c.description || undefined,
          gender: c.gender,
          declensions: c.declensions,
          firstAppearance: chapterNum,
          mentionedInChapters: [chapterNum],
          autoDetected: true,
        }));
        const newLocations = newLocationsFilteredCancel.map((l, idx) => ({
          id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
          type: 'location' as const,
          original: l.originalName,
          translated: l.translatedName,
          description: l.description || undefined,
          firstAppearance: chapterNum,
          mentionedInChapters: [chapterNum],
          autoDetected: true,
        }));
        const newTerms = newTermsFilteredCancel.map((t, idx) => ({
          id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
          type: 'term' as const,
          original: t.originalTerm,
          translated: t.translatedTerm,
          description: t.description || undefined,
          notes: t.category,
          firstAppearance: chapterNum,
          mentionedInChapters: [chapterNum],
          autoDetected: true,
        }));
        glossaryUpdates.push(...newCharacters, ...newLocations, ...newTerms);
        const byOriginalCancel = (orig: string, type: 'character' | 'location' | 'term') =>
          project.glossary.find(
            (e) => e.type === type && e.original.trim().toLowerCase() === orig.trim().toLowerCase()
          );
        const ids = new Set<string>();
        for (const c of analysis.foundCharacters ?? []) {
          const entry = c.isNew
            ? byShortFormCancel(c.name, 'character')
            : byOriginalCancel(c.name, 'character');
          if (entry?.id) ids.add(entry.id);
        }
        for (const l of analysis.foundLocations ?? []) {
          const entry = l.isNew
            ? byShortFormCancel(l.name, 'location')
            : byOriginalCancel(l.name, 'location');
          if (entry?.id) ids.add(entry.id);
        }
        for (const t of analysis.foundTerms ?? []) {
          const entry = t.isNew
            ? byShortFormCancel(t.term, 'term')
            : byOriginalCancel(t.term, 'term');
          if (entry?.id) ids.add(entry.id);
        }
        const resolveUpdatedCharIdCancel = (c: { id?: string; originalName?: string }) => {
          if (!c.originalName) return c.id;
          const found = byOriginalCancel(c.originalName, 'character');
          return found?.id ?? c.id;
        };
        const resolveUpdatedLocIdCancel = (l: { id?: string; originalName?: string }) => {
          if (!l.originalName) return l.id;
          const found = byOriginalCancel(l.originalName, 'location');
          return found?.id ?? l.id;
        };
        const resolveUpdatedTermIdCancel = (t: { id?: string; originalTerm?: string }) => {
          if (!t.originalTerm) return t.id;
          const found = byOriginalCancel(t.originalTerm, 'term');
          return found?.id ?? t.id;
        };
        for (const c of glossaryUpdate.updatedCharacters ?? []) {
          const resolvedId = resolveUpdatedCharIdCancel(c);
          if (resolvedId) ids.add(resolvedId);
        }
        for (const l of glossaryUpdate.updatedLocations ?? []) {
          const resolvedId = resolveUpdatedLocIdCancel(l);
          if (resolvedId) ids.add(resolvedId);
        }
        for (const t of glossaryUpdate.updatedTerms ?? []) {
          const resolvedId = resolveUpdatedTermIdCancel(t);
          if (resolvedId) ids.add(resolvedId);
        }
        glossaryAppearanceEntryIds = [...ids];
        for (const c of glossaryUpdate.updatedCharacters ?? []) {
          const resolvedId = resolveUpdatedCharIdCancel(c);
          if (!resolvedId) continue;
          const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
          if (c.description !== undefined) updates.description = c.description;
          if (c.translatedName !== undefined) updates.translated = c.translatedName;
          if (Object.keys(updates).length > 0)
            glossaryUpdatesExisting.push({ id: resolvedId, updates });
        }
        for (const l of glossaryUpdate.updatedLocations ?? []) {
          const resolvedId = resolveUpdatedLocIdCancel(l);
          if (!resolvedId) continue;
          const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
          if (l.description !== undefined) updates.description = l.description;
          if (l.translatedName !== undefined) updates.translated = l.translatedName;
          if (Object.keys(updates).length > 0)
            glossaryUpdatesExisting.push({ id: resolvedId, updates });
        }
        for (const t of glossaryUpdate.updatedTerms ?? []) {
          const resolvedId = resolveUpdatedTermIdCancel(t);
          if (!resolvedId) continue;
          const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
          if (t.description !== undefined) updates.description = t.description;
          if (t.translatedTerm !== undefined) updates.translated = t.translatedTerm;
          if (t.category !== undefined) updates.notes = t.category;
          if (Object.keys(updates).length > 0)
            glossaryUpdatesExisting.push({ id: resolvedId, updates });
        }
      }
      return {
        translatedText: '',
        tokensUsed: result.totalTokensUsed,
        tokensByStage: result.stage1.tokensUsed
          ? { analysis: result.stage1.tokensUsed, translation: 0, editing: 0 }
          : undefined,
        duration: result.totalDuration,
        glossaryUpdates: glossaryUpdates.length > 0 ? glossaryUpdates : undefined,
        glossaryUpdatesExisting:
          glossaryUpdatesExisting.length > 0 ? glossaryUpdatesExisting : undefined,
        glossaryAppearanceEntryIds:
          glossaryAppearanceEntryIds.length > 0 ? glossaryAppearanceEntryIds : undefined,
        cancelled: true,
      };
    }

    const analysisOnly = Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis';
    if (!analysisOnly && (!result.finalTranslation || isChunkError(result.finalTranslation))) {
      throw new Error(result.finalTranslation || 'Translation returned empty result');
    }
    if (analysisOnly && !result.stage1.success) {
      logger.error({ error: result.stage1.error }, 'Engine: analysis stage failed');
      throw new Error(`Analysis failed: ${result.stage1.error ?? 'unknown'}`);
    }

    // Extract glossary updates from analysis stage (new + updates for existing)
    let glossaryUpdates: GlossaryEntry[] = [];
    const glossaryUpdatesExisting: Array<{
      id: string;
      updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
    }> = [];
    let glossaryAppearanceEntryIds: string[] = [];
    if (result.stage1.success && result.stage1.data) {
      const analysis = result.stage1.data;
      const glossaryUpdate = analysis.glossaryUpdate;
      const chapterNum = chapter.number;

      const byOriginal = (orig: string, type: 'character' | 'location' | 'term') =>
        project.glossary.find(
          (e) => e.type === type && e.original.trim().toLowerCase() === orig.trim().toLowerCase()
        );
      /** Find existing entry when model returned a short form (e.g. "Harry" matches "Harry Potter") */
      const byShortForm = (name: string, type: 'character' | 'location' | 'term') => {
        const n = name.trim().toLowerCase();
        if (n.length < 2) return undefined;
        return project.glossary.find(
          (e) =>
            e.type === type &&
            e.original
              .trim()
              .toLowerCase()
              .startsWith(n + ' ')
        );
      };

      // New entries (first appearance + mentionedInChapters for this chapter)
      // Exclude entries that match existing by short form to avoid duplicates
      const newCharactersFiltered = glossaryUpdate.newCharacters.filter(
        (c) => !byShortForm(c.originalName, 'character')
      );
      const newLocationsFiltered = glossaryUpdate.newLocations.filter(
        (l) => !byShortForm(l.originalName, 'location')
      );
      const newTermsFiltered = glossaryUpdate.newTerms.filter(
        (t) => !byShortForm(t.originalTerm, 'term')
      );

      const newCharacters = newCharactersFiltered.map((c, idx) => ({
        id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'character' as const,
        original: c.originalName,
        translated: c.translatedName,
        description: c.description || undefined,
        gender: c.gender,
        declensions: c.declensions,
        firstAppearance: chapterNum,
        mentionedInChapters: [chapterNum],
        autoDetected: true,
      }));
      const newLocations = newLocationsFiltered.map((l, idx) => ({
        id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'location' as const,
        original: l.originalName,
        translated: l.translatedName,
        description: l.description || undefined,
        firstAppearance: chapterNum,
        mentionedInChapters: [chapterNum],
        autoDetected: true,
      }));
      const newTerms = newTermsFiltered.map((t, idx) => ({
        id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'term' as const,
        original: t.originalTerm,
        translated: t.translatedTerm,
        description: t.description || undefined,
        notes: t.category,
        firstAppearance: chapterNum,
        mentionedInChapters: [chapterNum],
        autoDetected: true,
      }));
      glossaryUpdates = [...newCharacters, ...newLocations, ...newTerms];

      // Entry IDs that appeared in this chapter — server will merge chapter into their mentionedInChapters
      // Source 1: found* with isNew=false (exact match) or isNew=true but short-form match (e.g. "Harry" → "Harry Potter")
      const ids = new Set<string>();
      for (const c of analysis.foundCharacters ?? []) {
        const entry = c.isNew ? byShortForm(c.name, 'character') : byOriginal(c.name, 'character');
        if (entry?.id) ids.add(entry.id);
      }
      for (const l of analysis.foundLocations ?? []) {
        const entry = l.isNew ? byShortForm(l.name, 'location') : byOriginal(l.name, 'location');
        if (entry?.id) ids.add(entry.id);
      }
      for (const t of analysis.foundTerms ?? []) {
        const entry = t.isNew ? byShortForm(t.term, 'term') : byOriginal(t.term, 'term');
        if (entry?.id) ids.add(entry.id);
      }
      // Source 2: updated* (model put entity only in updatedCharacters/updatedLocations/updatedTerms — still counts as "appeared in this chapter")
      // Resolve id via project.glossary: updated* ids come from agent (may be engine ids for entries added in prev chapter)
      const resolveUpdatedCharId = (c: { id?: string; originalName?: string }) => {
        if (!c.originalName) return c.id;
        const found = byOriginal(c.originalName, 'character');
        return found?.id ?? c.id;
      };
      const resolveUpdatedLocId = (l: { id?: string; originalName?: string }) => {
        if (!l.originalName) return l.id;
        const found = byOriginal(l.originalName, 'location');
        return found?.id ?? l.id;
      };
      const resolveUpdatedTermId = (t: { id?: string; originalTerm?: string }) => {
        if (!t.originalTerm) return t.id;
        const found = byOriginal(t.originalTerm, 'term');
        return found?.id ?? t.id;
      };
      for (const c of glossaryUpdate.updatedCharacters ?? []) {
        const resolvedId = resolveUpdatedCharId(c);
        if (resolvedId) ids.add(resolvedId);
      }
      for (const l of glossaryUpdate.updatedLocations ?? []) {
        const resolvedId = resolveUpdatedLocId(l);
        if (resolvedId) ids.add(resolvedId);
      }
      for (const t of glossaryUpdate.updatedTerms ?? []) {
        const resolvedId = resolveUpdatedTermId(t);
        if (resolvedId) ids.add(resolvedId);
      }
      glossaryAppearanceEntryIds = [...ids];

      // Updates for existing entries (from analysis re-appearance in this chapter)
      for (const c of glossaryUpdate.updatedCharacters ?? []) {
        const resolvedId = resolveUpdatedCharId(c);
        if (!resolvedId) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (c.description !== undefined) updates.description = c.description;
        if (c.translatedName !== undefined) updates.translated = c.translatedName;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: resolvedId, updates });
      }
      for (const l of glossaryUpdate.updatedLocations ?? []) {
        const resolvedId = resolveUpdatedLocId(l);
        if (!resolvedId) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (l.description !== undefined) updates.description = l.description;
        if (l.translatedName !== undefined) updates.translated = l.translatedName;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: resolvedId, updates });
      }
      for (const t of glossaryUpdate.updatedTerms ?? []) {
        const resolvedId = resolveUpdatedTermId(t);
        if (!resolvedId) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (t.description !== undefined) updates.description = t.description;
        if (t.translatedTerm !== undefined) updates.translated = t.translatedTerm;
        if (t.category !== undefined) updates.notes = t.category;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: resolvedId, updates });
      }

      logger.info(
        {
          newCharacters: newCharacters.length,
          newLocations: newLocations.length,
          newTerms: newTerms.length,
          glossaryUpdatesExisting: glossaryUpdatesExisting.length,
          glossaryAppearanceEntryIds: glossaryAppearanceEntryIds.length,
          chapterNumber: chapter.number,
        },
        `Engine: found ${newCharacters.length} characters, ${newLocations.length} locations, ${newTerms.length} terms; updated ${glossaryUpdatesExisting.length} existing; ${glossaryAppearanceEntryIds.length} mentions in chapter`
      );
    }

    const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(
      project,
      options.languagePair
    );
    agentCache.set(agentCacheKey(project.id, sourceLanguage, targetLanguage), pipeline.getAgent());

    // Extract tokens by stage (include analysis/editing whenever that stage ran, even if 0)
    const ranAnalysis = Array.isArray(stages) ? stages.includes('analysis') : stages === 'all';
    const ranEditing = Array.isArray(stages) ? stages.includes('editing') : stages === 'all';
    const tokensByStage = {
      translation: result.stage2.tokensUsed,
      ...(ranAnalysis ? { analysis: result.stage1.tokensUsed } : {}),
      ...(ranEditing ? { editing: result.stage3.tokensUsed } : {}),
    };

    const chunkResults = result.stage2?.data?.chunkResults;
    const chunksCount = chunkResults?.length;
    const failedChunkIndex =
      chunkResults !== undefined
        ? chunkResults.findIndex((c) => isChunkError(c.translated || ''))
        : undefined;
    const failedChunkIndexNorm = failedChunkIndex === -1 ? undefined : failedChunkIndex;

    return {
      translatedText: result.finalTranslation,
      tokensUsed: result.totalTokensUsed,
      tokensByStage,
      duration: result.totalDuration,
      glossaryUpdates,
      glossaryUpdatesExisting:
        glossaryUpdatesExisting.length > 0 ? glossaryUpdatesExisting : undefined,
      glossaryAppearanceEntryIds:
        glossaryAppearanceEntryIds.length > 0 ? glossaryAppearanceEntryIds : undefined,
      ...(chunksCount !== undefined && { chunksCount }),
      ...(failedChunkIndexNorm !== undefined && { failedChunkIndex: failedChunkIndexNorm }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, `Translation failed: ${errorMessage}`);

    // Re-throw with more context
    throw new Error(`Translation failed: ${errorMessage}`);
  }
}

/**
 * Batch analysis of multiple chapters (parallel, with optional cache).
 * Returns glossary updates and per-chapter appearance IDs for server to save.
 */
export async function analyzeChaptersBatch(
  config: AppConfig,
  project: Project | ProjectWithChapterList,
  chapters: Array<Chapter & { originalText: string }>,
  options: {
    useCache?: boolean;
    analysisConcurrency?: number;
    languagePair?: Partial<LanguagePairOverride>;
    isCancelled?: () => boolean;
    onProgress?: (
      chapterId: string,
      result: { success: boolean; tokensUsed: number; error?: string }
    ) => void | Promise<void>;
    userRole?: UserRole;
  } = {}
): Promise<{
  totalTokensUsed: number;
  totalDuration: number;
  glossaryUpdates: GlossaryEntry[];
  glossaryUpdatesExisting: Array<{
    id: string;
    updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
  }>;
  chapterResults: Array<{
    chapterId: string;
    chapterNumber: number;
    success: boolean;
    tokensUsed: number;
    glossaryAppearanceEntryIds: string[];
  }>;
}> {
  const useCache = options.useCache ?? true;
  const startTime = Date.now();
  const pipeline = createPipeline(config, project, options.languagePair, options.userRole);
  const agent = getAgentForProject(project, options.languagePair);
  const effectivePair = resolveEffectiveLanguagePair(project, options.languagePair);
  const analysisCachePair = {
    sourceLanguage: effectivePair.sourceLanguage,
    targetLanguage: effectivePair.targetLanguage,
  };

  const byOriginal = (orig: string, type: 'character' | 'location' | 'term') =>
    project.glossary.find(
      (e) => e.type === type && e.original.trim().toLowerCase() === orig.trim().toLowerCase()
    );

  const cached: Array<{
    chapter: (typeof chapters)[0];
    data: import('./analysisCache.js').CachedAnalysisResult;
  }> = [];
  const toAnalyze: typeof chapters = [];

  if (useCache) {
    for (const ch of chapters) {
      const text = (ch.originalText ?? '').trim();
      if (!text) continue;
      const hit = await getCachedAnalysisResult(project.id, ch.id, analysisCachePair);
      if (hit) {
        cached.push({ chapter: ch, data: hit });
      } else {
        toAnalyze.push(ch);
      }
    }
  } else {
    toAnalyze.push(...chapters.filter((ch) => (ch.originalText ?? '').trim()));
  }

  const onProgress = options.onProgress;
  for (const { chapter, data } of cached) {
    await onProgress?.(chapter.id, {
      success: true,
      tokensUsed: data.tokensUsed,
    });
  }

  let batchResult: Awaited<ReturnType<TranslationPipeline['analyzeChaptersParallel']>> | null =
    null;
  if (toAnalyze.length > 0) {
    batchResult = await pipeline.analyzeChaptersParallel(
      toAnalyze.map((ch) => ({
        text: (ch.originalText ?? '').trim(),
        number: ch.number,
        id: ch.id,
      })),
      {
        includeGlossaryInAnalysis: project.settings?.includeGlossaryInAnalysis ?? true,
        temperatureByStage: {
          analysis:
            project.settings?.temperatureByStage?.analysis ?? project.settings?.temperature ?? 0.5,
        },
        analysisMaxSectionTokens: config.translation?.analysisMaxSectionTokens,
        analysisConcurrency:
          options.analysisConcurrency ?? config.translation?.analysisConcurrency ?? 4,
        isCancelled: options.isCancelled,
        onChapterComplete: onProgress
          ? (chapterId, _chapterNumber, result) => {
              if (chapterId) onProgress(chapterId, result);
            }
          : undefined,
      }
    );
    for (const r of batchResult.results) {
      if (r.success && r.data) {
        const ch = toAnalyze.find((c) => c.number === r.chapterNumber);
        if (ch) {
          await setCachedAnalysisResult(project.id, ch.id, analysisCachePair, {
            chapterNumber: r.chapterNumber,
            data: r.data,
            tokensUsed: r.tokensUsed,
          });
        }
      }
    }
  }

  const allResults: Array<{
    chapterId: string;
    chapterNumber: number;
    data: import('../engine/types/agent.js').AnalysisResult;
    tokensUsed: number;
  }> = [];

  for (const { chapter, data } of cached) {
    allResults.push({
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      data: data.data,
      tokensUsed: data.tokensUsed,
    });
  }
  const failedChapters: Array<{ chapterId: string; chapterNumber: number }> = [];
  if (batchResult) {
    for (const r of batchResult.results) {
      if (r.success && r.data) {
        const ch = toAnalyze.find((c) => c.number === r.chapterNumber);
        if (ch)
          allResults.push({
            chapterId: ch.id,
            chapterNumber: r.chapterNumber,
            data: r.data,
            tokensUsed: r.tokensUsed,
          });
      } else {
        const ch = toAnalyze.find((c) => c.number === r.chapterNumber);
        if (ch) failedChapters.push({ chapterId: ch.id, chapterNumber: ch.number });
      }
    }
  }

  allResults.sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (allResults.length > 0) {
    agent.applyBatchAnalysisResults(allResults.map((r) => r.data));
  }
  const { sourceLanguage, targetLanguage } = resolveEffectiveLanguagePair(
    project,
    options.languagePair
  );
  agentCache.set(agentCacheKey(project.id, sourceLanguage, targetLanguage), pipeline.getAgent());

  const entityChapters = new Map<string, number[]>();
  const addChapterForEntity = (key: string, chNum: number) => {
    const arr = entityChapters.get(key) ?? [];
    if (!arr.includes(chNum)) arr.push(chNum);
    entityChapters.set(key, arr);
  };

  const glossaryUpdates: GlossaryEntry[] = [];
  const glossaryUpdatesExisting: Array<{
    id: string;
    updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
  }> = [];
  const seenUpdates = new Set<string>();

  for (const { chapterNumber, data } of allResults) {
    const analysis = data;
    const glossaryUpdate = analysis.glossaryUpdate;

    for (const c of analysis.foundCharacters ?? []) {
      addChapterForEntity(`char:${c.name.toLowerCase()}`, chapterNumber);
    }
    for (const l of analysis.foundLocations ?? []) {
      addChapterForEntity(`loc:${l.name.toLowerCase()}`, chapterNumber);
    }
    for (const t of analysis.foundTerms ?? []) {
      addChapterForEntity(`term:${t.term.toLowerCase()}`, chapterNumber);
    }

    for (const c of glossaryUpdate.updatedCharacters ?? []) {
      const key = `char:${(c.originalName ?? '').toLowerCase()}`;
      addChapterForEntity(key, chapterNumber);
    }
    for (const l of glossaryUpdate.updatedLocations ?? []) {
      const key = `loc:${(l.originalName ?? '').toLowerCase()}`;
      addChapterForEntity(key, chapterNumber);
    }
    for (const t of glossaryUpdate.updatedTerms ?? []) {
      const key = `term:${(t.originalTerm ?? '').toLowerCase()}`;
      addChapterForEntity(key, chapterNumber);
    }
  }

  const newCharsByOrig = new Map<
    string,
    (typeof allResults)[0]['data']['glossaryUpdate']['newCharacters'][0]
  >();
  const newLocsByOrig = new Map<
    string,
    (typeof allResults)[0]['data']['glossaryUpdate']['newLocations'][0]
  >();
  const newTermsByOrig = new Map<
    string,
    (typeof allResults)[0]['data']['glossaryUpdate']['newTerms'][0]
  >();

  for (const { data } of allResults) {
    const gu = data.glossaryUpdate;
    for (const c of gu.newCharacters ?? []) {
      const key = c.originalName.toLowerCase();
      if (
        !newCharsByOrig.has(key) &&
        !project.glossary.some((e) => e.type === 'character' && e.original.toLowerCase() === key)
      ) {
        newCharsByOrig.set(key, c);
      }
    }
    for (const l of gu.newLocations ?? []) {
      const key = l.originalName.toLowerCase();
      if (
        !newLocsByOrig.has(key) &&
        !project.glossary.some((e) => e.type === 'location' && e.original.toLowerCase() === key)
      ) {
        newLocsByOrig.set(key, l);
      }
    }
    for (const t of gu.newTerms ?? []) {
      const key = t.originalTerm.toLowerCase();
      if (
        !newTermsByOrig.has(key) &&
        !project.glossary.some((e) => e.type === 'term' && e.original.toLowerCase() === key)
      ) {
        newTermsByOrig.set(key, t);
      }
    }
  }

  const minChapter =
    allResults.length > 0 ? Math.min(...allResults.map((r) => r.chapterNumber)) : 1;
  let idx = 0;
  for (const c of newCharsByOrig.values()) {
    const chaps = entityChapters.get(`char:${c.originalName.toLowerCase()}`) ?? [minChapter];
    chaps.sort((a, b) => a - b);
    glossaryUpdates.push({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'character',
      original: c.originalName,
      translated: c.translatedName,
      description: c.description || undefined,
      gender: c.gender,
      declensions: c.declensions,
      firstAppearance: Math.min(...chaps),
      mentionedInChapters: [...new Set(chaps)].sort((a, b) => a - b),
      autoDetected: true,
    });
    idx++;
  }
  for (const l of newLocsByOrig.values()) {
    const chaps = entityChapters.get(`loc:${l.originalName.toLowerCase()}`) ?? [minChapter];
    chaps.sort((a, b) => a - b);
    glossaryUpdates.push({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'location',
      original: l.originalName,
      translated: l.translatedName,
      description: l.description || undefined,
      firstAppearance: Math.min(...chaps),
      mentionedInChapters: [...new Set(chaps)].sort((a, b) => a - b),
      autoDetected: true,
    });
    idx++;
  }
  for (const t of newTermsByOrig.values()) {
    const chaps = entityChapters.get(`term:${t.originalTerm.toLowerCase()}`) ?? [minChapter];
    chaps.sort((a, b) => a - b);
    glossaryUpdates.push({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'term',
      original: t.originalTerm,
      translated: t.translatedTerm,
      description: t.description || undefined,
      notes: t.category,
      firstAppearance: Math.min(...chaps),
      mentionedInChapters: [...new Set(chaps)].sort((a, b) => a - b),
      autoDetected: true,
    });
    idx++;
  }

  for (const { data } of allResults) {
    const gu = data.glossaryUpdate;
    for (const c of gu.updatedCharacters ?? []) {
      const found = byOriginal(c.originalName ?? '', 'character');
      if (found && !seenUpdates.has(`char:${found.id}`)) {
        seenUpdates.add(`char:${found.id}`);
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (c.description !== undefined) updates.description = c.description;
        if (c.translatedName !== undefined) updates.translated = c.translatedName;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: found.id, updates });
      }
    }
    for (const l of gu.updatedLocations ?? []) {
      const found = byOriginal(l.originalName ?? '', 'location');
      if (found && !seenUpdates.has(`loc:${found.id}`)) {
        seenUpdates.add(`loc:${found.id}`);
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (l.description !== undefined) updates.description = l.description;
        if (l.translatedName !== undefined) updates.translated = l.translatedName;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: found.id, updates });
      }
    }
    for (const t of gu.updatedTerms ?? []) {
      const found = byOriginal(t.originalTerm ?? '', 'term');
      if (found && !seenUpdates.has(`term:${found.id}`)) {
        seenUpdates.add(`term:${found.id}`);
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (t.description !== undefined) updates.description = t.description;
        if (t.translatedTerm !== undefined) updates.translated = t.translatedTerm;
        if (t.category !== undefined) updates.notes = t.category;
        if (Object.keys(updates).length > 0)
          glossaryUpdatesExisting.push({ id: found.id, updates });
      }
    }
  }

  const combinedGlossary = [...project.glossary, ...glossaryUpdates];
  const byOriginalOrNew = (orig: string, type: 'character' | 'location' | 'term') =>
    combinedGlossary.find(
      (e) => e.type === type && e.original.trim().toLowerCase() === orig.trim().toLowerCase()
    );
  const byShortFormOrNew = (name: string, type: 'character' | 'location' | 'term') => {
    const n = name.trim().toLowerCase();
    if (n.length < 2) return undefined;
    return combinedGlossary.find(
      (e) =>
        e.type === type &&
        e.original
          .trim()
          .toLowerCase()
          .startsWith(n + ' ')
    );
  };

  const chapterResults = allResults.map(({ chapterId, chapterNumber, data, tokensUsed }) => {
    const analysis = data;
    const ids = new Set<string>();
    for (const c of analysis.foundCharacters ?? []) {
      const entry = c.isNew
        ? byShortFormOrNew(c.name, 'character')
        : byOriginalOrNew(c.name, 'character');
      if (entry?.id) ids.add(entry.id);
    }
    for (const l of analysis.foundLocations ?? []) {
      const entry = l.isNew
        ? byShortFormOrNew(l.name, 'location')
        : byOriginalOrNew(l.name, 'location');
      if (entry?.id) ids.add(entry.id);
    }
    for (const t of analysis.foundTerms ?? []) {
      const entry = t.isNew ? byShortFormOrNew(t.term, 'term') : byOriginalOrNew(t.term, 'term');
      if (entry?.id) ids.add(entry.id);
    }
    for (const c of analysis.glossaryUpdate.updatedCharacters ?? []) {
      const found = byOriginalOrNew(c.originalName ?? '', 'character');
      if (found?.id) ids.add(found.id);
    }
    for (const l of analysis.glossaryUpdate.updatedLocations ?? []) {
      const found = byOriginalOrNew(l.originalName ?? '', 'location');
      if (found?.id) ids.add(found.id);
    }
    for (const t of analysis.glossaryUpdate.updatedTerms ?? []) {
      const found = byOriginalOrNew(t.originalTerm ?? '', 'term');
      if (found?.id) ids.add(found.id);
    }
    return {
      chapterId,
      chapterNumber,
      success: true,
      tokensUsed,
      glossaryAppearanceEntryIds: [...ids],
    };
  });

  for (const { chapterId, chapterNumber } of failedChapters) {
    chapterResults.push({
      chapterId,
      chapterNumber,
      success: false,
      tokensUsed: 0,
      glossaryAppearanceEntryIds: [],
    });
  }
  chapterResults.sort((a, b) => a.chapterNumber - b.chapterNumber);

  const totalTokensUsed = allResults.reduce((s, r) => s + r.tokensUsed, 0);

  return {
    totalTokensUsed,
    totalDuration: Date.now() - startTime,
    glossaryUpdates,
    glossaryUpdatesExisting,
    chapterResults,
  };
}

/**
 * Simple translation without full pipeline (faster, for small texts)
 */
export async function translateSimple(
  config: AppConfig,
  text: string,
  glossary: GlossaryEntry[]
): Promise<{ text: string; tokensUsed: number }> {
  const OpenAI = (await import('openai')).default;

  const client = new OpenAI({
    apiKey: config.openai.apiKey,
  });

  // Build glossary section using engine's helper
  const characters = glossary
    .filter((e) => e.type === 'character')
    .map((e) => ({
      original: e.original,
      translated: e.translated,
      declensions: e.declensions,
      description: e.description,
    }));

  const locations = glossary
    .filter((e) => e.type === 'location')
    .map((e) => ({
      original: e.original,
      translated: e.translated,
      description: e.description,
    }));

  const terms = glossary
    .filter((e) => e.type === 'term')
    .map((e) => ({
      original: e.original,
      translated: e.translated,
      description: e.description,
    }));

  const glossarySection = createGlossaryPromptSection(characters, locations, terms);

  // Use engine translator prompt for en→ru (simple translate has no project context)
  const systemPrompt =
    resolvePrompts('translate', 'en', 'ru').systemPrompt +
    (glossarySection ? `\n\n${glossarySection}` : '');

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: config.translation.temperature,
  });

  return {
    text: response.choices[0]?.message?.content || '',
    tokensUsed: response.usage?.total_tokens || 0,
  };
}

/**
 * Auto-detect characters in text using engine's analyzer prompt
 */
export async function detectCharacters(
  config: AppConfig,
  text: string
): Promise<{ name: string; gender: 'male' | 'female' | 'unknown'; context: string }[]> {
  const OpenAI = (await import('openai')).default;

  const client = new OpenAI({
    apiKey: config.openai.apiKey,
  });

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: 'system',
        content: `Extract character names from the text. Output JSON array:
[{"name": "John", "gender": "male", "context": "first mention context"}]
Only include proper names of characters, not common nouns.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  try {
    const content = response.choices[0]?.message?.content || '{"characters":[]}';
    const parsed = JSON.parse(content);
    return parsed.characters || [];
  } catch {
    return [];
  }
}

/**
 * Get declensions for a name using engine
 */
export function getNameDeclensions(
  englishName: string,
  gender?: 'male' | 'female' | 'neutral' | 'unknown'
): {
  translatedName: string;
  declensions: {
    nominative: string;
    genitive: string;
    dative: string;
    accusative: string;
    instrumental: string;
    prepositional: string;
  };
  gender: 'male' | 'female' | 'neutral' | 'unknown';
} {
  return translateAndDeclineName(englishName, gender);
}

/**
 * Chunk text using engine's chunker
 */
export function chunkTextForTranslation(
  text: string,
  maxTokens: number = 2000
): { id: string; content: string; index: number }[] {
  return chunkText(text, { maxTokens, preserveParagraphs: true });
}

/**
 * Clear agent cache for a project
 */
export function clearAgentCache(projectId: string): void {
  for (const key of agentCache.keys()) {
    if (key === projectId || key.startsWith(`${projectId}:`)) {
      agentCache.delete(key);
    }
  }
}

/**
 * Get agent state as JSON (for debugging/export)
 */
export function exportAgentState(projectId: string): string | null {
  const agent =
    agentCache.get(projectId) ??
    [...agentCache.entries()].find(([key]) => key.startsWith(`${projectId}:`))?.[1];
  return agent ? agent.toJSON() : null;
}
