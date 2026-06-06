/**
 * Common types used across the translation engine
 */

export type Language =
  | 'ja' // Japanese
  | 'zh' // Chinese
  | 'ko' // Korean
  | 'en' // English
  | 'ru' // Russian
  | 'be' // Belarusian
  | 'pl'; // Polish

export type Gender = 'male' | 'female' | 'neutral' | 'unknown';

export interface Declensions {
  nominative: string; // кто? что? - Ямада
  genitive: string; // кого? чего? - Ямады
  dative: string; // кому? чему? - Ямаде
  accusative: string; // кого? что? - Ямаду
  instrumental: string; // кем? чем? - Ямадой
  prepositional: string; // о ком? о чём? - о Ямаде
}

export interface TextChunk {
  id: string;
  content: string;
  index: number;
  tokenCount?: number;
  /** Separator that followed this chunk in the original text (e.g. '\n\n' or '\n\n\n'). Used when merging. */
  separatorAfter?: string;
}

export interface TranslationConfig {
  sourceLanguage: Language;
  targetLanguage: Language;
  preserveFormatting: boolean;
  maxTokensPerChunk: number;
  temperature: number;
}

/** Text block type for special formatting (system messages, notes, etc.) */
export type TextBlockHtmlTag = 'aside' | 'section' | 'div' | 'span' | 'blockquote';

export interface TextBlockType {
  id: string;
  name: string;
  description: string;
  htmlTag: TextBlockHtmlTag;
  cssClass: string;
  isInline: boolean;
  icon?: string;
  enabled: boolean;
}
