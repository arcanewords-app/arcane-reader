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
import type { Glossary, Character, Location, Term } from '../types/glossary.js';
import { ANALYZER_SYSTEM_PROMPT, createAnalyzerPrompt } from '../prompts/system/analyzer.js';
import { GlossaryManager } from '../glossary/glossary-manager.js';
import { log } from '../logger.js';

interface AnalyzeStageOptions {
  chapterNumber: number;
  existingGlossary?: Glossary;
  temperature?: number;
}

/** Allowed gender values (DB constraint). LLM may return "masculine", "f", etc. */
const ALLOWED_GENDERS = ['male', 'female', 'neutral', 'unknown'] as const;
type AllowedGender = (typeof ALLOWED_GENDERS)[number];

function normalizeGender(value: unknown): AllowedGender {
  if (value == null || value === '') return 'unknown';
  const s = String(value).trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'masculine') return 'male';
  if (s === 'female' || s === 'f' || s === 'feminine') return 'female';
  if (s === 'neutral' || s === 'n' || s === 'other' || s === 'non-binary') return 'neutral';
  if (s === 'unknown' || s === 'u') return 'unknown';
  if (ALLOWED_GENDERS.includes(s as AllowedGender)) return s as AllowedGender;
  return 'unknown';
}

const LOCATION_TYPES = ['city', 'country', 'building', 'region', 'world', 'other'] as const;
function normalizeLocationType(value: unknown): (typeof LOCATION_TYPES)[number] {
  if (value == null || value === '') return 'other';
  const s = String(value).trim().toLowerCase();
  if (LOCATION_TYPES.includes(s as any)) return s as (typeof LOCATION_TYPES)[number];
  if (s === 'town' || s === 'village' || s === 'place') return 'city';
  if (s === 'area' || s === 'zone') return 'region';
  return 'other';
}

const TERM_CATEGORIES = ['skill', 'magic', 'item', 'title', 'organization', 'race', 'other'] as const;
function normalizeTermCategory(value: unknown): (typeof TERM_CATEGORIES)[number] {
  if (value == null || value === '') return 'other';
  const s = String(value).trim().toLowerCase();
  if (TERM_CATEGORIES.includes(s as any)) return s as (typeof TERM_CATEGORIES)[number];
  if (s === 'spell' || s === 'ability') return 'magic';
  if (s === 'rank' || s === 'position') return 'title';
  if (s === 'group' || s === 'guild' || s === 'faction') return 'organization';
  return 'other';
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
  /** Refined/merged updates for entities already in the glossary (agent returns these) */
  updatedCharacters?: {
    originalName: string;
    description?: string;
    suggestedTranslation?: string;
  }[];
  updatedLocations?: {
    originalName: string;
    description?: string;
    suggestedTranslation?: string;
  }[];
  updatedTerms?: {
    originalTerm: string;
    description?: string;
    suggestedTranslation?: string;
    category?: string;
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
    log.debug('AnalyzeStage initialized', {
      hasProvider: !!this.provider,
      model: (this.provider as any)?.model || 'unknown',
      hasCompleteJSON: typeof this.provider.completeJSON,
    });
  }
  
  async execute(
    sourceText: string,
    options: AnalyzeStageOptions
  ): Promise<StageResult<AnalysisResult>> {
    const startTime = Date.now();
    
    if (!this.provider) {
      log.warn('AnalyzeStage.execute: provider not initialized');
      return {
        stage: 'analyze',
        success: false,
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: 'Analysis provider is not initialized',
      };
    }

    if (typeof this.provider.completeJSON !== 'function') {
      log.warn('AnalyzeStage.execute: provider missing completeJSON', {
        providerType: typeof this.provider,
        hasCompleteJSON: !!this.provider.completeJSON,
      });
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
      const temperature = options.temperature ?? 0.3;
      const promptChars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
      const model = (this.provider as { model?: string })?.model ?? '';
      // Analysis is a single request per chapter (no chunking). For long chapters or reasoning
      // models (o1, gpt-5) this can take 2–5+ min — ensure OPENAI_TIMEOUT_MS is high enough.
      const isReasoningModel = /^gpt-5|^o1-|^o3-|^o4-/i.test(model);
      log.debug('AnalyzeStage: calling provider.completeJSON', { promptChars, model });
      if (isReasoningModel) {
        log.info('AnalyzeStage: reasoning model in use, first response may take 1–5 minutes');
      }
      const response = await this.provider.completeJSON<RawAnalysisResponse>(messages, {
        temperature,
        maxTokens: 4096,
      });
      const tokensUsed = response.tokensUsed?.total ?? 0;
      log.debug('AnalyzeStage: provider returned', { tokensUsed });

      // Parse and validate response
      const result = this.parseResponse(response.data, options);

      return {
        stage: 'analyze',
        success: true,
        data: result,
        tokensUsed,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error(`AnalyzeStage error: ${errMsg}`, error instanceof Error ? error : undefined);
      return {
        stage: 'analyze',
        success: false,
        error: errMsg,
        tokensUsed: 0,
        duration: Date.now() - startTime,
      };
    }
  }
  
  private parseResponse(
    raw: RawAnalysisResponse,
    options: AnalyzeStageOptions
  ): AnalysisResult {
    const existingChars = options.existingGlossary?.characters ?? [];
    const existingLocs = options.existingGlossary?.locations ?? [];
    const existingTermsList = options.existingGlossary?.terms ?? [];
    const existingCharNames = new Set(existingChars.map(c => c.originalName.toLowerCase()));
    const existingLocNames = new Set(existingLocs.map(l => l.originalName.toLowerCase()));
    const existingTermSet = new Set(existingTermsList.map(t => t.originalTerm.toLowerCase()));

    const findExistingChar = (name: string) =>
      existingChars.find(c => c.originalName.toLowerCase() === name.toLowerCase());
    const findExistingLoc = (name: string) =>
      existingLocs.find(l => l.originalName.toLowerCase() === name.toLowerCase());
    const findExistingTerm = (term: string) =>
      existingTermsList.find(t => t.originalTerm.toLowerCase() === term.toLowerCase());

    // Map agent-returned updated* (by original name/term) to entries with id for DB updates
    const mapUpdatedCharacters = (): Partial<Character>[] => {
      const out: Partial<Character>[] = [];
      for (const c of raw.updatedCharacters ?? []) {
        const existing = findExistingChar(c.originalName);
        if (!existing) continue;
        const entry: Partial<Character> = { id: existing.id };
        if ((c.description?.trim() ?? '').length > 0) entry.description = c.description!.trim();
        if ((c.suggestedTranslation?.trim() ?? '').length > 0) entry.translatedName = c.suggestedTranslation!.trim();
        if (Object.keys(entry).length > 1) out.push(entry);
      }
      return out;
    };
    const mapUpdatedLocations = (): Partial<Location>[] => {
      const out: Partial<Location>[] = [];
      for (const l of raw.updatedLocations ?? []) {
        const existing = findExistingLoc(l.originalName);
        if (!existing) continue;
        const entry: Partial<Location> = { id: existing.id };
        if ((l.description?.trim() ?? '').length > 0) entry.description = l.description!.trim();
        if ((l.suggestedTranslation?.trim() ?? '').length > 0) entry.translatedName = l.suggestedTranslation!.trim();
        if (Object.keys(entry).length > 1) out.push(entry);
      }
      return out;
    };
    const mapUpdatedTerms = (): Partial<Term>[] => {
      const out: Partial<Term>[] = [];
      for (const t of raw.updatedTerms ?? []) {
        const existing = findExistingTerm(t.originalTerm);
        if (!existing) continue;
        const entry: Partial<Term> = { id: existing.id };
        if ((t.description?.trim() ?? '').length > 0) entry.description = t.description!.trim();
        if ((t.suggestedTranslation?.trim() ?? '').length > 0) entry.translatedTerm = t.suggestedTranslation!.trim();
        if ((t.category?.trim() ?? '').length > 0) entry.category = (t.category as Term['category']) ?? 'other';
        if (Object.keys(entry).length > 1) out.push(entry);
      }
      return out;
    };

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
        isNew: !existingTermSet.has(t.term.toLowerCase()),
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
            gender: normalizeGender(c.gender),
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
            type: normalizeLocationType(l.type),
            description: l.description ?? '',
          })),
        newTerms: (raw.terms ?? [])
          .filter(t => !existingTermSet.has(t.term.toLowerCase()))
          .map(t => ({
            originalTerm: t.term,
            translatedTerm: t.suggestedTranslation ?? t.term,
            category: normalizeTermCategory(t.category),
            description: t.description ?? '',
          })),
        updatedCharacters: mapUpdatedCharacters(),
        updatedLocations: mapUpdatedLocations(),
        updatedTerms: mapUpdatedTerms(),
      },
    };
  }
}

