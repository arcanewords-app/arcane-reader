/**
 * Novel Agent types - maintains context and consistency across chapters
 */

import type { Language, TranslationConfig } from './common.js';
import type { Glossary, GlossaryUpdate } from './glossary.js';

export interface StyleProfile {
  tone: string;              // "dark fantasy", "light romance", "action"
  narrativeVoice: string;    // "first person", "third person omniscient"
  dialogueStyle: string;     // Dialogue characteristics
  writingStyle: string;      // Author's unique style notes
  targetAudience: string;    // "young adult", "adult"
}

export interface ChapterSummary {
  chapterNumber: number;
  title?: string;
  summary: string;
  keyEvents: string[];
  activeCharacters: string[];
  location: string;
}

export interface CurrentContext {
  lastEvents: string[];
  activeCharacters: string[];
  currentLocation: string;
  currentMood: string;
  openPlotThreads: string[];
}

export interface NovelAgentState {
  novelId: string;
  title: string;
  author?: string;
  
  sourceLanguage: Language;
  targetLanguage: Language;
  
  glossary: Glossary;
  styleProfile: StyleProfile;
  
  translatedChapters: ChapterSummary[];
  currentContext: CurrentContext;
  
  config: TranslationConfig;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisResult {
  chapterNumber: number;
  
  // Extracted entities
  foundCharacters: {
    name: string;
    isNew: boolean;
    suggestedTranslation?: string;
    context: string;
  }[];
  
  foundLocations: {
    name: string;
    isNew: boolean;
    suggestedTranslation?: string;
  }[];
  
  foundTerms: {
    term: string;
    isNew: boolean;
    suggestedTranslation?: string;
    category: string;
  }[];
  
  // Chapter analysis
  chapterSummary: string;
  keyEvents: string[];
  mood: string;
  
  // Style observations
  styleNotes?: string;
  
  // Suggested glossary updates
  glossaryUpdate: GlossaryUpdate;
}

export interface AgentContext {
  glossary: Glossary;
  styleProfile: StyleProfile;
  previousChapters: ChapterSummary[];
  currentContext: CurrentContext;
}

