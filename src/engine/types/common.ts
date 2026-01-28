/**
 * Common types used across the translation engine
 */

export type Language = 
  | 'ja'  // Japanese
  | 'zh'  // Chinese
  | 'ko'  // Korean
  | 'en'  // English
  | 'ru'  // Russian
  | 'pl'; // Polish

export type Gender = 'male' | 'female' | 'neutral' | 'unknown';

export interface Declensions {
  nominative: string;    // кто? что? - Ямада
  genitive: string;      // кого? чего? - Ямады
  dative: string;        // кому? чему? - Ямаде
  accusative: string;    // кого? что? - Ямаду
  instrumental: string;  // кем? чем? - Ямадой
  prepositional: string; // о ком? о чём? - о Ямаде
}

export interface TextChunk {
  id: string;
  content: string;
  index: number;
  tokenCount?: number;
}

export interface TranslationConfig {
  sourceLanguage: Language;
  targetLanguage: Language;
  preserveFormatting: boolean;
  maxTokensPerChunk: number;
  temperature: number;
}

