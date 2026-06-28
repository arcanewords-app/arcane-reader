/**
 * Domain types for projects, chapters, glossary, and catalog entities.
 * Persistence: Supabase via supabaseDatabase.ts.
 */

import type { EvaluationIssue } from '../shared/evaluation-normalize.js';

// Types
/**
 * Project type - determines how project is handled and what metadata is available
 * Extensible for future types (web, document, series, etc.)
 */
export type ProjectType = 'book' | 'text' | string; // string allows for future extensions

/**
 * Unified project metadata structure
 * Common fields available for all project types
 * Type-specific fields can be added as needed
 */
export interface ProjectMetadata {
  // Common fields (available for all types)
  title?: string; // Original title from source
  description?: string; // Description/annotation
  language?: string; // Source language (if detected)
  coverImageUrl?: string; // URL to cover/image

  // Book-specific fields (for type === 'book')
  authors?: string[];
  publisher?: string;

  // Entity references (global public entities from admin)
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityIds?: string[];
  /** Catalog cover badge; null/omit = no badge. */
  translationStatus?: 'in_progress' | 'complete' | 'abandoned' | null;
  isbn?: string;
  series?: string;
  seriesNumber?: number;
  publishedDate?: string;

  // Future: web-specific, document-specific fields can be added here
  /** Optional link to original source (web novel, official page). Synced to publication on publish. */
  sourceUrl?: string;
  // documentType?: string; // For 'document' type
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType; // Project type: 'book', 'text', or future types
  sourceLanguage: string;
  targetLanguage: string;
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  settings: ProjectSettings;
  metadata?: ProjectMetadata; // Unified metadata (type-specific fields based on type)
  createdAt: string;
  updatedAt: string;
}

/** Project with lightweight chapter list (for lazy loading) */
export type ProjectWithChapterList = Omit<Project, 'chapters'> & {
  chapters: ChapterListItem[];
};

/** Chapter summary for ProcessChapters (no full text loaded) */
export interface ChapterSummary {
  id: string;
  number: number;
  title: string;
  translatedTitle?: string;
  status: ChapterStatus;
  hasTranslation: boolean;
  isFullyTranslated: boolean;
  hasOriginalText: boolean;
  paragraphCount: number;
  translatedParagraphCount: number;
  lastAnalysisAt?: string;
}

/** Status of individual paragraph */
export type ParagraphStatus = 'pending' | 'translated' | 'edited' | 'approved';

/** Individual paragraph with original and translated text */
export interface Paragraph {
  id: string;
  index: number;
  originalText: string;
  translatedText?: string;
  status: ParagraphStatus;
  editedAt?: string;
  editedBy?: 'ai' | 'user';
}

/** Chapter status */
export type ChapterStatus =
  | 'pending'
  | 'translating'
  | 'analyzed'
  | 'draft' // Translation saved, editing not applied (refactor 2.1)
  | 'partial' // Translation started but not all content paragraphs filled
  | 'completed'
  | 'error';

/** Lightweight chapter for list view (no paragraphs, no text) */
export interface ChapterListItem {
  id: string;
  number: number;
  title: string;
  translatedTitle?: string;
  status: ChapterStatus;
  hasTranslation: boolean;
  translationMeta?: Chapter['translationMeta'];
}

export interface ChapterCriticReport {
  strengths: string;
  summary: string;
  issues: EvaluationIssue[];
  contentFingerprint: string;
  paragraphCount: number;
  model: string;
  tokensUsed: number;
  durationMs: number;
  createdAt: string;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  translatedTitle?: string;
  // Raw text (kept for compatibility and full-text operations)
  originalText: string;
  translatedText?: string;
  // Translated chunks - parsed parts of translation for later sync with paragraphs
  translatedChunks?: string[];
  // Structured paragraphs for editing
  paragraphs: Paragraph[];
  status: ChapterStatus;
  translationMeta?: {
    tokensUsed: number; // Total tokens (for backward compatibility)
    tokensByStage?: {
      analysis?: number;
      translation: number;
      editing?: number;
    };
    duration: number;
    model: string;
    translatedAt: string;
    /** Source of translation: 'ai' for pipeline, 'uploaded' for user-uploaded */
    source?: 'uploaded' | 'ai';
    /** When analysis was last run successfully (ISO). Used to avoid duplicate analysis and show "Analyzed" in UI. */
    lastAnalysisAt?: string;
    /** Number of translation chunks (for debugging / UI). */
    chunksCount?: number;
    /** Index of first failed chunk (0-based), or -1 if none (for debugging / UI). */
    failedChunkIndex?: number;
  };
  /** Persisted AI translation review (Author+ Critic mode). */
  criticReport?: ChapterCriticReport;
}

export interface GlossaryEntry {
  id: string;
  type: 'character' | 'location' | 'term';
  original: string;
  translated: string;
  gender?: 'male' | 'female' | 'neutral' | 'unknown';
  declensions?: {
    nominative: string;
    genitive: string;
    dative: string;
    accusative: string;
    instrumental: string;
    prepositional: string;
  };
  description?: string; // Character/location/term description (from analysis or manual)
  notes?: string; // User notes (separate from description)
  autoDetected?: boolean;
  firstAppearance?: number; // Chapter number where this entry was first mentioned
  /** Chapter numbers where this entry was mentioned (from analysis). Sorted, unique. */
  mentionedInChapters?: number[];
  /** IDs of related glossary entries (character–location, character–character, etc.). Editable manually. */
  relatedEntryIds?: string[];
  /** For characters: primary location ID (optional). */
  primaryLocationId?: string;
  imageUrls?: string[]; // Array of image file paths for gallery
  // Legacy support: keep imageUrl for backward compatibility
  imageUrl?: string;
}

export type PublicEntityKind = 'tag' | 'author' | 'translator';

export interface PublicEntity {
  id: string;
  kind: PublicEntityKind;
  name: string;
  description?: string;
  photoUrl?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewsCategory = 'feature' | 'discount' | 'update' | 'other';
export type NewsStatus = 'draft' | 'published' | 'archived';
export type AnnouncementVariant = 'info' | 'promo' | 'neutral';
export type AnnouncementMinRole =
  | 'guest'
  | 'user'
  | 'author'
  | 'author_plus'
  | 'super_author'
  | 'admin';

export interface NewsPost {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  body: string;
  category: NewsCategory;
  status: NewsStatus;
  primaryLocale: string;
  translations: Record<string, unknown>;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementAlert {
  id: string;
  newsPostId: string | null;
  message: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: AnnouncementVariant;
  minRole: AnnouncementMinRole;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
  contentVersion: number;
  dismissible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAnnouncement {
  id: string;
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  newsPostId: string | null;
  variant: AnnouncementVariant;
  contentVersion: number;
  dismissible: boolean;
}

/** Font family options for reader */
export type FontFamily =
  | 'default'
  | 'merriweather'
  | 'montserrat'
  | 'noto_sans'
  | 'oswald'
  | 'roboto'
  | 'cormorant_garamond'
  | 'eb_garamond'
  | 'times_new_roman'
  | 'georgia'
  | 'arial'
  | 'helvetica';

/** Color scheme options */
export type ColorScheme = 'dark' | 'light' | 'sepia' | 'contrast' | 'paper' | 'custom';

/** Reader display settings */
export interface ReaderSettings {
  // Typography
  fontFamily: FontFamily;
  fontSize: number; // 14-24px
  lineHeight: number; // 1.4-2.0

  // Colors
  colorScheme: ColorScheme;
  customBg?: string;
  customText?: string;

  // Layout
  textIndent: boolean;
  textAlign: 'left' | 'justify';
  hideChapterHeader: boolean;
  paragraphSpacing: number; // em, 0-2.0
  containerWidth: number; // %, 50-100
}

/** Text block HTML tag options */
export type TextBlockHtmlTag = 'aside' | 'section' | 'div' | 'span' | 'blockquote';

/** Special text block type for formatting (system messages, notes, letters, etc.) */
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

/** Custom instructions for translator and editor stages */
export interface CustomInstructions {
  translation?: string;
  editing?: string;
}

export interface ProjectSettings {
  // Legacy: single model (for backward compatibility)
  model?: string;

  // Per-stage model configuration
  stageModels?: {
    analysis: string; // Stage 1: Extract entities, analyze style
    translation: string; // Stage 2: Translate (required)
    editing: string; // Stage 3: Polish and refine
  };

  temperature: number;
  temperatureByStage?: {
    analysis?: number;
    translation?: number;
    editing?: number;
  };
  // Pipeline stages control
  enableAnalysis: boolean; // Stage 1: Extract entities, analyze style
  enableTranslation: boolean; // Stage 2: Translate (always true, required)
  enableEditing: boolean; // Stage 3: Polish and refine
  originalReadingMode?: boolean; // Режим оригинального чтения (только анализ, без перевода)
  /** When false, analysis stage does not receive existing glossary (saves tokens). Default true. */
  includeGlossaryInAnalysis?: boolean;
  /** When false, translation stage does not receive glossary; chunks 3500 (terms aligned in editing). Default true. */
  includeGlossaryInTranslation?: boolean;
  /** When false, editing stage does not receive glossary; chunks 3500. Default true. */
  includeGlossaryInEditing?: boolean;
  // Reader display settings
  reader: ReaderSettings;
  /** Special text block types for formatting (system messages, notes, letters, etc.) */
  textBlockTypes?: TextBlockType[];
  /** When true, enabled text block types are sent to the translation stage. Default false. */
  includeTextBlockTypesInTranslation?: boolean;
  /** Custom instructions for translator and editor stages */
  customInstructions?: CustomInstructions;
  /** Editing style preset: default, literary, minimal, ai_revivification */
  editingStylePreset?: 'default' | 'literary' | 'minimal' | 'ai_revivification';
  /** Editing focus: fix_only, polish, elevate */
  editingFocus?: 'fix_only' | 'polish' | 'elevate';
  /** When true, allow reasoning models (o1, gpt-5, etc.) for analysis. Warning: 1–5 min per request. Default false. */
  allowReasoningModelsForAnalysis?: boolean;
  /** Append few-shot BAD/GOOD examples to translate system prompt. */
  enableTranslateFewShot?: boolean;
  /** Require CoT analysis field in translate JSON response. */
  enableTranslateCoT?: boolean;
  /** Use strict json_schema for CoT translate responses. */
  enableTranslateStructuredCoT?: boolean;
  /** Preceding source paragraphs per translate chunk (0 = off). */
  translateLeadingContextParagraphs?: number;
  /** Preset: chunk 1200 + leading 2 + few-shot for mini models. */
  miniModelTranslationProfile?: boolean;
  /** Translate execution mode override (undefined = auto from model). */
  translateExecutionMode?: 'one_shot' | 'chunked';
  /** Edit execution mode override (undefined = auto from model). */
  editExecutionMode?: 'one_shot' | 'chunked';
  /** Force token chunking even when single-shot would fit. */
  forceChunked?: boolean;
  /** Override default chunk size tier (800–4500). */
  chunkSize?: number;
}
