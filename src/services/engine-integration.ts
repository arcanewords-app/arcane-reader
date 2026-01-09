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
          description: entry.notes || '',
          aliases: [],
          firstAppearance: 1,
          isMainCharacter: false,
        });
      }
    }
    
    agentCache.set(project.id, agent);
  }
  
  return agent;
}

/**
 * Create translation pipeline for a project
 */
export function createPipeline(
  config: AppConfig,
  project: Project
): TranslationPipeline {
  const provider = new OpenAIProvider({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
  });
  
  const agent = getAgentForProject(project);
  
  return new TranslationPipeline({
    provider,
    agent,
  });
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
  const pipeline = createPipeline(config, project);
  
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
  
  // Extract glossary updates from analysis stage
  let glossaryUpdates: GlossaryEntry[] = [];
  if (result.stage1.success && result.stage1.data) {
    const analysis = result.stage1.data;
    
    // Add new characters
    const newCharacters = analysis.foundCharacters
      .filter(c => c.isNew)
      .map(c => ({
        id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'character' as const,
        original: c.name,
        translated: c.suggestedTranslation || c.name,
        autoDetected: true,
      }));
    
    // Add new locations
    const newLocations = analysis.foundLocations
      .filter(l => l.isNew)
      .map(l => ({
        id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'location' as const,
        original: l.name,
        translated: l.suggestedTranslation || l.name,
        autoDetected: true,
      }));
    
    // Add new terms
    const newTerms = analysis.foundTerms
      .filter(t => t.isNew)
      .map(t => ({
        id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'term' as const,
        original: t.term,
        translated: t.suggestedTranslation || t.term,
        notes: t.category,
        autoDetected: true,
      }));
    
    glossaryUpdates = [...newCharacters, ...newLocations, ...newTerms];
    
    console.log(`📚 [Engine] Найдено: ${newCharacters.length} персонажей, ${newLocations.length} локаций, ${newTerms.length} терминов`);
  }
  
  // Update agent cache
  agentCache.set(project.id, pipeline.getAgent());
  
  return {
    translatedText: result.finalTranslation,
    tokensUsed: result.totalTokensUsed,
    duration: result.totalDuration,
    glossaryUpdates,
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
    .filter(e => e.type === 'character')
    .map(e => ({
      original: e.original,
      translated: e.translated,
      declensions: e.declensions,
    }));
  
  const locations = glossary
    .filter(e => e.type === 'location')
    .map(e => ({
      original: e.original,
      translated: e.translated,
    }));
  
  const terms = glossary
    .filter(e => e.type === 'term')
    .map(e => ({
      original: e.original,
      translated: e.translated,
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

