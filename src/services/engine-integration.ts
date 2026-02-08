/**
 * Engine Integration - подключение arcane-engine к arcane-reader
 *
 * Использует TranslationPipeline, NovelAgent и промпты из engine
 */

import {
  TranslationPipeline,
  OpenAIProvider,
  NovelAgent,
  GlossaryManager,
  TRANSLATOR_SYSTEM_PROMPT,
  createGlossaryPromptSection,
  chunkText,
  translateAndDeclineName,
  type PipelineResult,
  type PipelineOptions,
  type Character,
  type Glossary,
} from '../engine/index.js';

import type { AppConfig } from '../config.js';
import type { Project, Chapter, GlossaryEntry } from '../storage/database.js';
import { logger } from '../logger.js';

// Cache for NovelAgents per project
const agentCache = new Map<string, NovelAgent>();

/**
 * Get or create NovelAgent for a project
 */
export function getAgentForProject(project: Project): NovelAgent {
  let agent = agentCache.get(project.id);

  if (!agent) {
    agent = NovelAgent.create({
      novelId: project.id,
      title: project.name,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });

    // Load existing glossary into agent
    const glossaryManager = agent.glossary as unknown as Glossary;
    for (const entry of project.glossary) {
      if (entry.type === 'character') {
        const { translatedName, declensions, gender } = translateAndDeclineName(
          entry.original,
          entry.gender as 'male' | 'female' | 'neutral' | 'unknown'
        );

        glossaryManager.characters.push({
          id: entry.id,
          originalName: entry.original,
          translatedName: entry.translated || translatedName,
          declensions: entry.declensions || declensions,
          gender,
          description: entry.description || '', // Use description field
          aliases: [],
          firstAppearance: entry.firstAppearance || 1,
          isMainCharacter: false,
        });
      } else if (entry.type === 'location') {
        glossaryManager.locations.push({
          id: entry.id,
          originalName: entry.original,
          translatedName: entry.translated,
          description: entry.description || '',
          type: 'other',
        });
      } else if (entry.type === 'term') {
        glossaryManager.terms.push({
          id: entry.id,
          originalTerm: entry.original,
          translatedTerm: entry.translated,
          description: entry.description || '',
          category: 'other',
        });
      }
    }

    agentCache.set(project.id, agent);
  }

  return agent;
}

/**
 * Get model for a specific stage, with fallbacks
 */
function getStageModel(
  project: Project,
  stage: 'analysis' | 'translation' | 'editing',
  defaultModel: string
): string {
  const stageModels = project.settings?.stageModels;
  const stageModel = stageModels?.[stage];
  if (stageModel && typeof stageModel === 'string' && stageModel.trim()) {
    return stageModel;
  }
  if (project.settings?.model) {
    return project.settings.model;
  }
  return defaultModel;
}

/** Models that only support v1/responses (not chat/completions). Fallback for old saved settings. */
const RESPONSES_ONLY_MODELS = new Set(['gpt-5.1-codex-mini', 'codex-mini-latest']);
const FALLBACK_MODEL = 'gpt-4o-mini';

function modelForChatCompletions(id: string): string {
  return RESPONSES_ONLY_MODELS.has(id) ? FALLBACK_MODEL : id;
}

/**
 * Create translation pipeline for a project
 */
export function createPipeline(config: AppConfig, project: Project): TranslationPipeline {
  // Validate API key
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const rawAnalysisModel = modelForChatCompletions(
    getStageModel(project, 'analysis', 'gpt-4.1-mini') || 'gpt-4o-mini'
  );
  // Analysis: forbid reasoning models (gpt-5*, o1*, o3*, o4*) — they take 1–5 min per request and are not suitable
  const isReasoningModel = (m: string) => /^gpt-5|^o1-|^o3-|^o4-/i.test(m);
  const analysisModel = isReasoningModel(rawAnalysisModel) ? 'gpt-4.1-mini' : rawAnalysisModel;
  if (rawAnalysisModel !== analysisModel) {
    logger.debug(
      { rawAnalysisModel, analysisModel },
      'Analysis: reasoning model not allowed for analysis, using fallback'
    );
  }

  const translationModel = modelForChatCompletions(
    getStageModel(project, 'translation', 'gpt-5-mini') ||
      getStageModel(project, 'translation', 'gpt-4.1-mini') ||
      config.openai.model
  );
  const editingModel = modelForChatCompletions(
    getStageModel(project, 'editing', 'gpt-4.1-mini') || 'gpt-4o-mini'
  );

  logger.debug(
    { analysisModel, translationModel, editingModel, hasApiKey: !!config.openai.apiKey },
    'Creating pipeline providers'
  );

  let analysisProvider: OpenAIProvider;
  let translationProvider: OpenAIProvider;
  let editingProvider: OpenAIProvider;

  try {
    // Analysis = one request per chapter (no chunking). Timeout should allow for slow/reasoning models.
    analysisProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: analysisModel,
      timeout: config.openai.timeout,
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
      timeout: config.openai.timeout,
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
      timeout: config.openai.timeout,
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

  const agent = getAgentForProject(project);

  logger.debug(
    {
      hasAnalysis: !!providers.analysis,
      analysisModel: (providers.analysis as any)?.model,
      hasTranslation: !!providers.translation,
      translationModel: (providers.translation as any)?.model,
      hasEditing: !!providers.editing,
      editingModel: (providers.editing as any)?.model,
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
};

/**
 * Translate chapter using the full pipeline.
 * Stages are passed from the API (stages param); glossary is loaded from project
 * and updated after analysis; agent cache is keyed by project id.
 */
export async function translateChapterWithPipeline(
  config: AppConfig,
  project: Project,
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
}> {
  try {
    const pipeline = createPipeline(config, project);
    const stages = options.stages ?? 'all';

    const fallbackTemp = project.settings.temperature ?? config.translation?.temperature ?? 0.5;
    const pipelineOpts: PipelineOptions = {
      chunkSize: config.translation.maxTokensPerChunk,
      temperatureByStage: {
        analysis: project.settings.temperatureByStage?.analysis ?? fallbackTemp,
        translation: project.settings.temperatureByStage?.translation ?? fallbackTemp,
        editing: project.settings.temperatureByStage?.editing ?? fallbackTemp,
      },
      ...(options.isCancelled && { isCancelled: options.isCancelled }),
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

    const analysisOnly = Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis';
    if (
      !analysisOnly &&
      (!result.finalTranslation || result.finalTranslation.startsWith('[ERROR]'))
    ) {
      throw new Error(result.finalTranslation || 'Translation returned empty result');
    }
    if (analysisOnly && !result.stage1.success) {
      logger.error({ error: result.stage1.error }, 'Engine: analysis stage failed');
      throw new Error(`Analysis failed: ${result.stage1.error ?? 'unknown'}`);
    }

    // Extract glossary updates from analysis stage (new + updates for existing)
    let glossaryUpdates: GlossaryEntry[] = [];
    let glossaryUpdatesExisting: Array<{
      id: string;
      updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>>;
    }> = [];
    let glossaryAppearanceEntryIds: string[] = [];
    if (result.stage1.success && result.stage1.data) {
      const analysis = result.stage1.data;
      const glossaryUpdate = analysis.glossaryUpdate;

      // New entries (first appearance + mentionedInChapters for this chapter)
      const chapterNum = chapter.number;
      const newCharacters = glossaryUpdate.newCharacters.map((c, idx) => ({
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
      const newLocations = glossaryUpdate.newLocations.map((l, idx) => ({
        id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'location' as const,
        original: l.originalName,
        translated: l.translatedName,
        description: l.description || undefined,
        firstAppearance: chapterNum,
        mentionedInChapters: [chapterNum],
        autoDetected: true,
      }));
      const newTerms = glossaryUpdate.newTerms.map((t, idx) => ({
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
      // Source 1: found* with isNew=false (model put entity in characters/locations/terms and we matched by original)
      const byOriginal = (orig: string, type: 'character' | 'location' | 'term') =>
        project.glossary.find(
          (e) => e.type === type && e.original.trim().toLowerCase() === orig.trim().toLowerCase()
        );
      const ids = new Set<string>();
      for (const c of analysis.foundCharacters ?? []) {
        if (!c.isNew) {
          const entry = byOriginal(c.name, 'character');
          if (entry?.id) ids.add(entry.id);
        }
      }
      for (const l of analysis.foundLocations ?? []) {
        if (!l.isNew) {
          const entry = byOriginal(l.name, 'location');
          if (entry?.id) ids.add(entry.id);
        }
      }
      for (const t of analysis.foundTerms ?? []) {
        if (!t.isNew) {
          const entry = byOriginal(t.term, 'term');
          if (entry?.id) ids.add(entry.id);
        }
      }
      // Source 2: updated* (model put entity only in updatedCharacters/updatedLocations/updatedTerms — still counts as "appeared in this chapter")
      for (const c of glossaryUpdate.updatedCharacters ?? []) {
        if (c.id) ids.add(c.id);
      }
      for (const l of glossaryUpdate.updatedLocations ?? []) {
        if (l.id) ids.add(l.id);
      }
      for (const t of glossaryUpdate.updatedTerms ?? []) {
        if (t.id) ids.add(t.id);
      }
      glossaryAppearanceEntryIds = [...ids];

      // Updates for existing entries (from analysis re-appearance in this chapter)
      for (const c of glossaryUpdate.updatedCharacters ?? []) {
        if (!c.id) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (c.description !== undefined) updates.description = c.description;
        if (c.translatedName !== undefined) updates.translated = c.translatedName;
        if (Object.keys(updates).length > 0) glossaryUpdatesExisting.push({ id: c.id, updates });
      }
      for (const l of glossaryUpdate.updatedLocations ?? []) {
        if (!l.id) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (l.description !== undefined) updates.description = l.description;
        if (l.translatedName !== undefined) updates.translated = l.translatedName;
        if (Object.keys(updates).length > 0) glossaryUpdatesExisting.push({ id: l.id, updates });
      }
      for (const t of glossaryUpdate.updatedTerms ?? []) {
        if (!t.id) continue;
        const updates: Partial<Pick<GlossaryEntry, 'description' | 'translated' | 'notes'>> = {};
        if (t.description !== undefined) updates.description = t.description;
        if (t.translatedTerm !== undefined) updates.translated = t.translatedTerm;
        if (t.category !== undefined) updates.notes = t.category;
        if (Object.keys(updates).length > 0) glossaryUpdatesExisting.push({ id: t.id, updates });
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

    // Update agent cache
    agentCache.set(project.id, pipeline.getAgent());

    // Extract tokens by stage (include analysis/editing whenever that stage ran, even if 0)
    const ranAnalysis = Array.isArray(stages) ? stages.includes('analysis') : stages === 'all';
    const ranEditing = Array.isArray(stages) ? stages.includes('editing') : stages === 'all';
    const tokensByStage = {
      translation: result.stage2.tokensUsed,
      ...(ranAnalysis ? { analysis: result.stage1.tokensUsed } : {}),
      ...(ranEditing ? { editing: result.stage3.tokensUsed } : {}),
    };

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
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, `Translation failed: ${errorMessage}`);

    // Re-throw with more context
    throw new Error(`Translation failed: ${errorMessage}`);
  }
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

  // Use engine's system prompt
  const systemPrompt = TRANSLATOR_SYSTEM_PROMPT + (glossarySection ? `\n\n${glossarySection}` : '');

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
  agentCache.delete(projectId);
}

/**
 * Get agent state as JSON (for debugging/export)
 */
export function exportAgentState(projectId: string): string | null {
  const agent = agentCache.get(projectId);
  return agent ? agent.toJSON() : null;
}
