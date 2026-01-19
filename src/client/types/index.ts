/**
 * Arcane Reader - TypeScript Types
 * Shared types for the client application
 */

// === Declensions (Russian grammar cases) ===

export interface Declensions {
  nominative: string;   // Именительный (кто? что?)
  genitive: string;     // Родительный (кого? чего?)
  dative: string;       // Дательный (кому? чему?)
  accusative: string;   // Винительный (кого? что?)
  instrumental: string; // Творительный (кем? чем?)
  prepositional: string;// Предложный (о ком? о чём?)
}

// === Glossary ===

export type GlossaryEntryType = 'character' | 'location' | 'term';
export type Gender = 'male' | 'female' | 'neutral' | 'unknown';

export interface GlossaryEntry {
  id: string;
  type: GlossaryEntryType;
  original: string;
  translated: string;
  gender?: Gender;
  declensions?: Declensions;
  description?: string; // Character/location/term description (from analysis or manual)
  notes?: string; // User notes (separate from description)
  firstAppearance?: number; // Chapter number where this entry was first mentioned
  imageUrls?: string[]; // Array of image URLs for gallery
  autoDetected?: boolean;
  // Legacy support: keep imageUrl for backward compatibility
  imageUrl?: string;
}

// === Paragraphs ===

export type ParagraphStatus = 'pending' | 'translated' | 'approved' | 'edited';
export type EditedBy = 'ai' | 'user';

export interface Paragraph {
  id: string;
  index: number;
  originalText: string;
  translatedText?: string;
  status: ParagraphStatus;
  editedAt?: string;
  editedBy?: EditedBy;
}

// === Chapters ===

export type ChapterStatus = 'pending' | 'translating' | 'completed' | 'error';

export interface TranslationMeta {
  tokensUsed: number; // Total tokens (for backward compatibility)
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  };
  duration: number;
  model: string;
  translatedAt: string;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  originalText: string;
  translatedText?: string;
  translatedChunks?: string[]; // Parsed translation chunks for later sync with paragraphs
  paragraphs?: Paragraph[];
  status: ChapterStatus;
  translationMeta?: TranslationMeta;
  createdAt: string;
  updatedAt: string;
}

// === Reader Settings ===

export type ColorScheme = 'dark' | 'light' | 'sepia' | 'contrast';
export type FontFamily = 'literary' | 'serif' | 'sans' | 'mono';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamily;
  colorScheme: ColorScheme;
}

// === Project Settings ===

export interface ProjectSettings {
  // Legacy: single model (for backward compatibility)
  model?: string;
  
  // Per-stage model configuration
  stageModels?: {
    analysis: string;    // Stage 1: Extract entities, analyze style
    translation: string;  // Stage 2: Translate (required)
    editing: string;     // Stage 3: Polish and refine
  };
  
  temperature: number;
  enableAnalysis?: boolean;
  enableTranslation?: boolean;
  enableEditing?: boolean;
  reader?: ReaderSettings;
}

// === Project ===

export interface Project {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

// === Project List Item (summary) ===

export interface ProjectListItem {
  id: string;
  name: string;
  chapterCount: number;
  translatedCount: number;
  glossaryCount: number;
  createdAt: string;
  updatedAt: string;
}

// === API Response Types ===

export interface SystemStatus {
  version: string;
  ready: boolean;
  ai: {
    provider: string | null;
    model: string;
    configured: boolean;
  };
  config: {
    valid: boolean;
    errors: string[];
  };
  storage: string;
}

export interface ChapterStats {
  total: number;
  translated: number;
  approved: number;
  pending: number;
  progress: number;
}

export interface TranslateResponse {
  status: 'started';
  chapterId: string;
}

export interface BulkUpdateResponse {
  updated: number;
  paragraphs: Paragraph[];
}

// === Auth ===

export interface AuthUser {
  id: string;
  email: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface LoginResponse {
  user: AuthUser;
  session: Session | null;
}

export interface RegisterResponse {
  user: AuthUser;
}
