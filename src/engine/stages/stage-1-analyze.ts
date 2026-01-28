/**
 * Stage 1: Analysis
 * 
 * Analyzes source text to extract:
 * - Characters, locations, terms
 * - Writing style
 * - Context for translation
 */

import type { ILLMProvider, Message } from '../interfaces/llm-provider.js';
import type { AnalysisResult } from '../types/agent.js';
import type { StageResult } from '../types/pipeline.js';
import type { Glossary } from '../types/glossary.js';
import { ANALYZER_SYSTEM_PROMPT, createAnalyzerPrompt } from '../prompts/system/analyzer.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';

interface AnalyzeStageOptions {
  chapterNumber: number;
  existingGlossary?: Glossary;
}

interface RawAnalysisResponse {
  characters?: {
    name: string;
    suggestedTranslation?: string;
    gender?: string;
    role?: string;
    description?: string;
    context?: string;
  }[];
  locations?: {
    name: string;
    suggestedTranslation?: string;
    type?: string;
    description?: string;
  }[];
  terms?: {
    term: string;
    suggestedTranslation?: string;
    category?: string;
    description?: string;
  }[];
  chapterSummary?: string;
  keyEvents?: string[];
  mood?: string;
  styleNotes?: string;
}

export class AnalyzeStage {
  private provider: ILLMProvider;
  
  constructor(provider: ILLMProvider) {
    if (!provider) {
      throw new Error('AnalyzeStage: provider is required but was undefined');
    }
    if (typeof provider.completeJSON !== 'function') {
      throw new Error(`AnalyzeStage: provider is missing completeJSON method. Provider type: ${typeof provider}, model: ${(provider as any)?.model || 'unknown'}`);
    }
    this.provider = provider;
    console.log(`[AnalyzeStage] Initialized with provider: ${!!this.provider}, model: ${(this.provider as any)?.model || 'unknown'}, has completeJSON: ${typeof this.provider.completeJSON}`);
  }
  
  async execute(
    sourceText: string,
    options: AnalyzeStageOptions
  ): Promise<StageResult<AnalysisResult>> {
    const startTime = Date.now();
    
    // Double-check provider (should never fail if constructor passed)
    if (!this.provider) {
      return {
        stage: 'analyze',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Analysis provider is not initialized',
      };
    }
    
    if (typeof this.provider.completeJSON !== 'function') {
      return {
        stage: 'analyze',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: `Analysis provider is missing completeJSON method. Provider type: ${typeof this.provider}, has completeJSON: ${!!this.provider.completeJSON}`,
      };
    }
    
    try {
      // Create glossary text for context
      let glossaryText = '';
      if (options.existingGlossary) {
        const manager = new GlossaryManager(options.existingGlossary);
        glossaryText = manager.toPromptText();
      }
      
      // Build messages
      const messages: Message[] = [
        { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: createAnalyzerPrompt(
            sourceText,
            'English',
            'Russian',
            glossaryText || undefined
          )
        },
      ];
      
      // Call LLM
      const response = await this.provider.completeJSON<RawAnalysisResponse>(messages, {
        temperature: 0.3,
        maxTokens: 4096,
      });
      
      // Parse and validate response
      const result = this.parseResponse(response.data, options);
      
      return {
        stage: 'analyze',
        success: true,
        data: result,
        tokensUsed: response.tokensUsed.total,
        duration: Date.now() - startTime,
      };
      
    } catch (error) {
      return {
        stage: 'analyze',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        duration: Date.now() - startTime,
      };
    }
  }
  
  private parseResponse(
    raw: RawAnalysisResponse,
    options: AnalyzeStageOptions
  ): AnalysisResult {
    const existingCharNames = new Set(
      options.existingGlossary?.characters.map(c => c.originalName.toLowerCase()) ?? []
    );
    const existingLocNames = new Set(
      options.existingGlossary?.locations.map(l => l.originalName.toLowerCase()) ?? []
    );
    const existingTerms = new Set(
      options.existingGlossary?.terms.map(t => t.originalTerm.toLowerCase()) ?? []
    );
    
    return {
      chapterNumber: options.chapterNumber,
      
      foundCharacters: (raw.characters ?? []).map(c => ({
        name: c.name,
        isNew: !existingCharNames.has(c.name.toLowerCase()),
        suggestedTranslation: c.suggestedTranslation,
        context: c.context ?? '',
      })),
      
      foundLocations: (raw.locations ?? []).map(l => ({
        name: l.name,
        isNew: !existingLocNames.has(l.name.toLowerCase()),
        suggestedTranslation: l.suggestedTranslation,
      })),
      
      foundTerms: (raw.terms ?? []).map(t => ({
        term: t.term,
        isNew: !existingTerms.has(t.term.toLowerCase()),
        suggestedTranslation: t.suggestedTranslation,
        category: t.category ?? 'other',
      })),
      
      chapterSummary: raw.chapterSummary ?? '',
      keyEvents: raw.keyEvents ?? [],
      mood: raw.mood ?? '',
      styleNotes: raw.styleNotes,
      
      glossaryUpdate: {
        newCharacters: (raw.characters ?? [])
          .filter(c => !existingCharNames.has(c.name.toLowerCase()))
          .map(c => ({
            originalName: c.name,
            translatedName: c.suggestedTranslation ?? c.name,
            declensions: {
              nominative: c.suggestedTranslation ?? c.name,
              genitive: c.suggestedTranslation ?? c.name,
              dative: c.suggestedTranslation ?? c.name,
              accusative: c.suggestedTranslation ?? c.name,
              instrumental: c.suggestedTranslation ?? c.name,
              prepositional: c.suggestedTranslation ?? c.name,
            },
            gender: (c.gender as 'male' | 'female' | 'neutral' | 'unknown') ?? 'unknown',
            description: c.description ?? '',
            aliases: [],
            firstAppearance: options.chapterNumber,
            isMainCharacter: c.role === 'protagonist',
          })),
        newLocations: (raw.locations ?? [])
          .filter(l => !existingLocNames.has(l.name.toLowerCase()))
          .map(l => ({
            originalName: l.name,
            translatedName: l.suggestedTranslation ?? l.name,
            type: (l.type as 'city' | 'country' | 'building' | 'region' | 'world' | 'other') ?? 'other',
            description: l.description ?? '',
          })),
        newTerms: (raw.terms ?? [])
          .filter(t => !existingTerms.has(t.term.toLowerCase()))
          .map(t => ({
            originalTerm: t.term,
            translatedTerm: t.suggestedTranslation ?? t.term,
            category: (t.category as 'skill' | 'magic' | 'item' | 'title' | 'organization' | 'race' | 'other') ?? 'other',
            description: t.description ?? '',
          })),
        updatedCharacters: [],
        updatedLocations: [],
        updatedTerms: [],
      },
    };
  }
}

