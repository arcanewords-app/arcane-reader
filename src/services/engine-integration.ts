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
} from 'arcane-engine';

import type { AppConfig } from '../config.js';
import type { Project, Chapter, GlossaryEntry } from '../storage/database.js';

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
  // Use per-stage models if available
  if (project.settings.stageModels) {
    return project.settings.stageModels[stage];
  }
  
  // Fallback to legacy model if available
  if (project.settings.model) {
    return project.settings.model;
  }
  
  // Final fallback to config default
  return defaultModel;
}

/**
 * Create translation pipeline for a project
 */
export function createPipeline(
  config: AppConfig,
  project: Project
): TranslationPipeline {
  // Validate API key
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  // Create separate providers for each stage with their respective models
  // Defaults optimized for promotional models with fallback
  const analysisModel = getStageModel(project, 'analysis', 'gpt-4.1-mini') || 'gpt-4o-mini';
  // Fallback: use gpt-4.1-mini if gpt-5-mini not available
  const translationModel = getStageModel(project, 'translation', 'gpt-5-mini') || getStageModel(project, 'translation', 'gpt-4.1-mini') || config.openai.model;
  const editingModel = getStageModel(project, 'editing', 'gpt-4.1-mini') || 'gpt-4o-mini';
  
  console.log(`[Pipeline] Creating providers: analysis=${analysisModel}, translation=${translationModel}, editing=${editingModel}`);
  console.log(`[Pipeline] API key present: ${!!config.openai.apiKey}, length: ${config.openai.apiKey?.length || 0}`);
  
  let analysisProvider: OpenAIProvider;
  let translationProvider: OpenAIProvider;
  let editingProvider: OpenAIProvider;
  
  try {
    analysisProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: analysisModel,
    });
    console.log(`[Pipeline] ✅ Analysis provider created: ${!!analysisProvider}, has completeJSON: ${typeof analysisProvider.completeJSON}`);
  } catch (error) {
    console.error(`[Pipeline] ❌ Failed to create analysis provider:`, error);
    throw new Error(`Failed to create analysis provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  try {
    translationProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: translationModel,
    });
    console.log(`[Pipeline] ✅ Translation provider created: ${!!translationProvider}, has complete: ${typeof translationProvider.complete}`);
  } catch (error) {
    console.error(`[Pipeline] ❌ Failed to create translation provider:`, error);
    throw new Error(`Failed to create translation provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  try {
    editingProvider = new OpenAIProvider({
      apiKey: config.openai.apiKey,
      model: editingModel,
    });
    console.log(`[Pipeline] ✅ Editing provider created: ${!!editingProvider}, has complete: ${typeof editingProvider.complete}`);
  } catch (error) {
    console.error(`[Pipeline] ❌ Failed to create editing provider:`, error);
    throw new Error(`Failed to create editing provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const providers = {
    analysis: analysisProvider,
    translation: translationProvider,
    editing: editingProvider,
  };
  
  // Validate providers were created
  if (!providers.analysis || !providers.translation || !providers.editing) {
    console.error(`[Pipeline] ❌ Provider validation failed:`, {
      analysis: !!providers.analysis,
      translation: !!providers.translation,
      editing: !!providers.editing,
    });
    throw new Error('Failed to create LLM providers');
  }
  
  // Validate providers have required methods
  if (typeof providers.analysis.completeJSON !== 'function') {
    throw new Error('Analysis provider is missing completeJSON method (needed for structured output)');
  }
  if (typeof providers.translation.complete !== 'function') {
    throw new Error('Translation provider is missing complete method');
  }
  if (typeof providers.editing.complete !== 'function') {
    throw new Error('Editing provider is missing complete method');
  }
  // Editing stage also needs completeJSON for quality check (optional)
  if (typeof providers.editing.completeJSON !== 'function') {
    console.warn('[Pipeline] Editing provider missing completeJSON - quality check will be skipped');
  }
  
  const agent = getAgentForProject(project);
  
  console.log(`[Pipeline] About to create TranslationPipeline with providers:`);
  console.log(`  - analysis: ${!!providers.analysis}, model: ${(providers.analysis as any)?.model || 'unknown'}`);
  console.log(`  - translation: ${!!providers.translation}, model: ${(providers.translation as any)?.model || 'unknown'}`);
  console.log(`  - editing: ${!!providers.editing}, model: ${(providers.editing as any)?.model || 'unknown'}`);
  console.log(`  - agent: ${!!agent}`);
  
  try {
    const pipeline = new TranslationPipeline({
      providers,
      agent,
    });
    
    console.log(`[Pipeline] TranslationPipeline created successfully`);
    return pipeline;
  } catch (error) {
    console.error(`[Pipeline] ❌ Failed to create TranslationPipeline:`, error);
    throw error;
  }
}

/**
 * Translate chapter using the full pipeline
 */
export async function translateChapterWithPipeline(
  config: AppConfig,
  project: Project,
  chapter: Chapter,
  options: PipelineOptions = {}
): Promise<{
  translatedText: string;
  tokensUsed: number;
  duration: number;
  glossaryUpdates?: GlossaryEntry[];
}> {
  try {
    console.log(`[translateChapterWithPipeline] Creating pipeline...`);
    const pipeline = createPipeline(config, project);
    console.log(`[translateChapterWithPipeline] Pipeline created: ${!!pipeline}`);
    
    // Verify pipeline has stages
    console.log(`[translateChapterWithPipeline] Verifying pipeline stages...`);
    console.log(`  - Pipeline object: ${!!pipeline}, type: ${typeof pipeline}`);
    
    console.log(`🔮 [Engine] Запуск TranslationPipeline...`);
    console.log(`   Этапы: ${options.skipAnalysis ? '❌' : '✅'} Анализ | ✅ Перевод | ${options.skipEditing ? '❌' : '✅'} Редактура`);
    
    const result = await pipeline.translateChapter(
      chapter.originalText,
      chapter.number,
      {
        skipAnalysis: options.skipAnalysis ?? true, // Skip for now, can enable later
        skipEditing: options.skipEditing ?? config.translation.skipEditing,
        chunkSize: config.translation.maxTokensPerChunk,
      }
    );
    
    // Check if translation failed
    if (!result.finalTranslation || result.finalTranslation.startsWith('[ERROR]')) {
      throw new Error(result.finalTranslation || 'Translation returned empty result');
    }
  
  // Extract glossary updates from analysis stage
  let glossaryUpdates: GlossaryEntry[] = [];
  if (result.stage1.success && result.stage1.data) {
    const analysis = result.stage1.data;
    const glossaryUpdate = analysis.glossaryUpdate;
    
    // Add new characters (use glossaryUpdate which contains description)
    const newCharacters = glossaryUpdate.newCharacters.map((c, idx) => ({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'character' as const,
      original: c.originalName,
      translated: c.translatedName,
      description: c.description || undefined, // Save character description
      gender: c.gender,
      declensions: c.declensions,
      firstAppearance: chapter.number,
      autoDetected: true,
    }));
    
    // Add new locations (use glossaryUpdate which contains description)
    const newLocations = glossaryUpdate.newLocations.map((l, idx) => ({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'location' as const,
      original: l.originalName,
      translated: l.translatedName,
      description: l.description || undefined, // Save location description
      firstAppearance: chapter.number,
      autoDetected: true,
    }));
    
    // Add new terms (use glossaryUpdate which contains description)
    const newTerms = glossaryUpdate.newTerms.map((t, idx) => ({
      id: `auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'term' as const,
      original: t.originalTerm,
      translated: t.translatedTerm,
      description: t.description || undefined, // Save term description
      notes: t.category, // Category goes to notes
      firstAppearance: chapter.number,
      autoDetected: true,
    }));
    
    glossaryUpdates = [...newCharacters, ...newLocations, ...newTerms];
    
    console.log(`📚 [Engine] Найдено: ${newCharacters.length} персонажей, ${newLocations.length} локаций, ${newTerms.length} терминов (Глава ${chapter.number})`);
  }
  
    // Check if translation failed
    if (!result.finalTranslation || result.finalTranslation.startsWith('[ERROR]')) {
      throw new Error(result.finalTranslation || 'Translation returned empty result');
    }
    
    // Update agent cache
    agentCache.set(project.id, pipeline.getAgent());
    
    return {
      translatedText: result.finalTranslation,
      tokensUsed: result.totalTokensUsed,
      duration: result.totalDuration,
      glossaryUpdates,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Engine] Translation failed: ${errorMessage}`);
    console.error('Full error:', error);
    
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
    .filter(e => e.type === 'character')
    .map(e => ({
      original: e.original,
      translated: e.translated,
      declensions: e.declensions,
      description: e.description,
    }));
  
  const locations = glossary
    .filter(e => e.type === 'location')
    .map(e => ({
      original: e.original,
      translated: e.translated,
      description: e.description,
    }));
  
  const terms = glossary
    .filter(e => e.type === 'term')
    .map(e => ({
      original: e.original,
      translated: e.translated,
      description: e.description,
    }));
  
  const glossarySection = createGlossaryPromptSection(characters, locations, terms);
  
  // Use engine's system prompt
  const systemPrompt = TRANSLATOR_SYSTEM_PROMPT + 
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
  agentCache.delete(projectId);
}

/**
 * Get agent state as JSON (for debugging/export)
 */
export function exportAgentState(projectId: string): string | null {
  const agent = agentCache.get(projectId);
  return agent ? agent.toJSON() : null;
}

