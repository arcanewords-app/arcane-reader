/**
 * Novel Agent - Maintains context and consistency across novel translation
 */

import type { Language, TranslationConfig } from '../types/common.js';
import type { Glossary, Character, Location, Term, GlossaryUpdate } from '../types/glossary.js';
import type { 
  NovelAgentState, 
  StyleProfile, 
  ChapterSummary, 
  CurrentContext,
  AnalysisResult,
  AgentContext 
} from '../types/agent.js';

export class NovelAgent {
  private state: NovelAgentState;
  
  constructor(state: NovelAgentState) {
    this.state = state;
  }
  
  /**
   * Create a new agent for a novel
   */
  static create(params: {
    novelId: string;
    title: string;
    sourceLanguage: Language;
    targetLanguage: Language;
    config?: Partial<TranslationConfig>;
  }): NovelAgent {
    const state: NovelAgentState = {
      novelId: params.novelId,
      title: params.title,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      
      glossary: {
        novelId: params.novelId,
        version: 1,
        lastUpdated: new Date(),
        characters: [],
        locations: [],
        terms: [],
      },
      
      styleProfile: {
        tone: '',
        narrativeVoice: '',
        dialogueStyle: '',
        writingStyle: '',
        targetAudience: '',
      },
      
      translatedChapters: [],
      
      currentContext: {
        lastEvents: [],
        activeCharacters: [],
        currentLocation: '',
        currentMood: '',
        openPlotThreads: [],
      },
      
      config: {
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        preserveFormatting: true,
        maxTokensPerChunk: 2000,
        temperature: 0.7,
        ...params.config,
      },
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    return new NovelAgent(state);
  }
  
  /**
   * Load agent state from JSON
   */
  static fromJSON(json: string): NovelAgent {
    const state = JSON.parse(json) as NovelAgentState;
    state.createdAt = new Date(state.createdAt);
    state.updatedAt = new Date(state.updatedAt);
    state.glossary.lastUpdated = new Date(state.glossary.lastUpdated);
    return new NovelAgent(state);
  }
  
  /**
   * Export agent state to JSON
   */
  toJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }
  
  /**
   * Get context for translation pipeline
   */
  getContext(): AgentContext {
    return {
      glossary: this.state.glossary,
      styleProfile: this.state.styleProfile,
      previousChapters: this.state.translatedChapters.slice(-5), // Last 5 chapters
      currentContext: this.state.currentContext,
    };
  }
  
  /**
   * Update agent with analysis results from Stage 1
   */
  applyAnalysisResult(result: AnalysisResult): void {
    this.updateGlossary(result.glossaryUpdate);
    
    // Update current context
    this.state.currentContext = {
      lastEvents: result.keyEvents.slice(-5),
      activeCharacters: result.foundCharacters.map(c => c.name),
      currentLocation: result.foundLocations[0]?.name ?? this.state.currentContext.currentLocation,
      currentMood: result.mood,
      openPlotThreads: this.state.currentContext.openPlotThreads,
    };
    
    // Update style if new observations
    if (result.styleNotes) {
      this.state.styleProfile.writingStyle = 
        this.state.styleProfile.writingStyle 
          ? `${this.state.styleProfile.writingStyle}\n${result.styleNotes}`
          : result.styleNotes;
    }
    
    this.state.updatedAt = new Date();
  }
  
  /**
   * Record completed chapter translation
   */
  recordChapterTranslation(summary: ChapterSummary): void {
    this.state.translatedChapters.push(summary);
    this.state.updatedAt = new Date();
  }
  
  /**
   * Update glossary with new entries
   */
  updateGlossary(update: GlossaryUpdate): void {
    const glossary = this.state.glossary;
    
    // Add new characters
    for (const char of update.newCharacters) {
      glossary.characters.push({
        ...char,
        id: this.generateId('char'),
      });
    }
    
    // Add new locations
    for (const loc of update.newLocations) {
      glossary.locations.push({
        ...loc,
        id: this.generateId('loc'),
      });
    }
    
    // Add new terms
    for (const term of update.newTerms) {
      glossary.terms.push({
        ...term,
        id: this.generateId('term'),
      });
    }
    
    // Update existing entries
    for (const charUpdate of update.updatedCharacters) {
      const char = glossary.characters.find(c => c.id === charUpdate.id);
      if (char) Object.assign(char, charUpdate);
    }
    
    for (const locUpdate of update.updatedLocations) {
      const loc = glossary.locations.find(l => l.id === locUpdate.id);
      if (loc) Object.assign(loc, locUpdate);
    }
    
    for (const termUpdate of update.updatedTerms) {
      const term = glossary.terms.find(t => t.id === termUpdate.id);
      if (term) Object.assign(term, termUpdate);
    }
    
    glossary.version++;
    glossary.lastUpdated = new Date();
  }
  
  /**
   * Set style profile
   */
  setStyleProfile(profile: Partial<StyleProfile>): void {
    Object.assign(this.state.styleProfile, profile);
    this.state.updatedAt = new Date();
  }
  
  /**
   * Get character by original name
   */
  findCharacter(originalName: string): Character | undefined {
    return this.state.glossary.characters.find(
      c => c.originalName === originalName || c.aliases.includes(originalName)
    );
  }
  
  /**
   * Get location by original name
   */
  findLocation(originalName: string): Location | undefined {
    return this.state.glossary.locations.find(l => l.originalName === originalName);
  }
  
  /**
   * Get term by original name
   */
  findTerm(originalTerm: string): Term | undefined {
    return this.state.glossary.terms.find(t => t.originalTerm === originalTerm);
  }
  
  // Getters
  get novelId(): string { return this.state.novelId; }
  get title(): string { return this.state.title; }
  get glossary(): Glossary { return this.state.glossary; }
  get styleProfile(): StyleProfile { return this.state.styleProfile; }
  get config(): TranslationConfig { return this.state.config; }
  get chapterCount(): number { return this.state.translatedChapters.length; }
  
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

