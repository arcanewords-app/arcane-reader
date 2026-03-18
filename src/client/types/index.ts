/**
 * Arcane Reader - TypeScript Types
 * Shared types for the client application
 */

// === Declensions (Russian grammar cases) ===

export interface Declensions {
  nominative: string; // Именительный (кто? что?)
  genitive: string; // Родительный (кого? чего?)
  dative: string; // Дательный (кому? чему?)
  accusative: string; // Винительный (кого? что?)
  instrumental: string; // Творительный (кем? чем?)
  prepositional: string; // Предложный (о ком? о чём?)
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
  /** Chapter numbers where this entry was mentioned (from analysis). Sorted, unique. */
  mentionedInChapters?: number[];
  /** IDs of related glossary entries (character–location, character–character, etc.). Editable manually. */
  relatedEntryIds?: string[];
  /** For characters: primary location ID (optional). */
  primaryLocationId?: string;
  imageUrls?: string[]; // Array of image URLs for gallery
  autoDetected?: boolean;
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

export type ChapterStatus =
  | 'pending'
  | 'translating'
  | 'analyzed'
  | 'draft' // Translation saved, editing not applied
  | 'completed'
  | 'error';

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
  /** Source of translation: 'ai' for pipeline, 'uploaded' for user-uploaded */
  source?: 'uploaded' | 'ai';
  /** When analysis was last run successfully (ISO). Used to avoid duplicate analysis and show "Analyzed" in UI. */
  lastAnalysisAt?: string;
  /** Number of translation chunks (for debugging / UI). */
  chunksCount?: number;
  /** Index of first failed chunk (0-based), or -1 if none (for debugging / UI). */
  failedChunkIndex?: number;
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
  createdAt?: string;
  updatedAt?: string;
}

/** Lightweight chapter for list view (no paragraphs, no text) */
export interface ChapterListItem {
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  hasTranslation: boolean;
  translationMeta?: TranslationMeta;
}

/** Chapter summary for ProcessChapters (no full text loaded) */
export interface ChapterSummary {
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  hasTranslation: boolean;
  hasOriginalText: boolean;
  paragraphCount: number;
  translatedParagraphCount: number;
  lastAnalysisAt?: string;
}

/** Search match from project-wide search */
export interface ProjectSearchMatch {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  paragraphId: string;
  paragraphIndex: number;
  field: 'original' | 'translated';
  snippet: string;
  fullText: string;
}

/** Project with lightweight chapter list (for lazy loading) */
export type ProjectWithChapterList = Omit<Project, 'chapters'> & {
  chapters: ChapterListItem[];
};

// === Text Block Types (special formatting) ===

export type TextBlockHtmlTag = 'aside' | 'section' | 'div' | 'span' | 'blockquote';

export interface TextBlockType {
  id: string;
  name: string;
  description: string; // Description for LLM: "Game system notifications, stat updates, level-ups"
  htmlTag: TextBlockHtmlTag;
  cssClass: string;
  isInline: boolean; // true = span (within paragraph), false = block-level
  icon?: string;
  enabled: boolean;
}

export interface CustomInstructions {
  translation?: string; // Additional instructions for translator
  editing?: string; // Additional instructions for editor
}

// === Reader Settings ===

export type ColorScheme = 'dark' | 'light' | 'sepia' | 'contrast' | 'paper' | 'custom';
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

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamily;
  colorScheme: ColorScheme;
  textIndent: boolean;
  textAlign: 'left' | 'justify';
  hideChapterHeader: boolean;
  paragraphSpacing: number; // em, 0-2.0 (scales with font size)
  containerWidth: number; // %, 50-100
  customBg?: string;
  customText?: string;
}

/** Default reader settings (shared with server) */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: 'default',
  fontSize: 16,
  lineHeight: 1.6,
  colorScheme: 'dark',
  textIndent: false,
  textAlign: 'justify',
  hideChapterHeader: false,
  paragraphSpacing: 0.5,
  containerWidth: 69,
};

/** Legacy font keys for migration from old settings */
export const LEGACY_FONT_MAP: Record<string, FontFamily> = {
  literary: 'default',
  serif: 'cormorant_garamond',
  sans: 'roboto',
  mono: 'roboto',
  helvetica: 'helvetica',
};

// === Project Settings ===

export interface ProjectSettings {
  // Legacy: single model (for backward compatibility)
  model?: string;

  // Per-stage model configuration
  stageModels?: {
    analysis: string; // Stage 1: Extract entities, analyze style
    translation: string; // Stage 2: Translate (required)
    editing: string; // Stage 3: Polish and refine
  };

  temperature: number; // Legacy / default when temperatureByStage not set
  /** Per-stage creativity (0–1). Falls back to temperature if not set for a stage. */
  temperatureByStage?: {
    analysis?: number;
    translation?: number;
    editing?: number;
  };
  enableAnalysis?: boolean;
  enableTranslation?: boolean;
  enableEditing?: boolean;
  /** When false, analysis stage does not receive existing glossary (saves tokens). Default true. */
  includeGlossaryInAnalysis?: boolean;
  /** When false, translation stage does not receive glossary; chunks 3500 (terms aligned in editing). Default true. */
  includeGlossaryInTranslation?: boolean;
  /** When false, editing stage does not receive glossary; chunks 3500. Default true. */
  includeGlossaryInEditing?: boolean;
  reader?: ReaderSettings;
  /** Special text block types for formatting (system messages, notes, letters, etc.) */
  textBlockTypes?: TextBlockType[];
  /** Custom instructions for translator and editor stages */
  customInstructions?: CustomInstructions;
  /** Editing style preset: default, literary, minimal, ai_revivification */
  editingStylePreset?: 'default' | 'literary' | 'minimal' | 'ai_revivification';
  /** Editing focus: fix_problems, style_only, both */
  editingFocus?: 'fix_problems' | 'style_only' | 'both';
}

// === Project Metadata ===

export interface ProjectMetadata {
  title?: string;
  authors?: string[];
  language?: string;
  /** Global public entity ID for author (from admin). */
  authorEntityId?: string;
  /** Global public entity ID for translator (from admin). */
  translatorEntityId?: string;
  /** Global public entity IDs for tags (from admin). */
  tagEntityIds?: string[];
  publisher?: string;
  description?: string;
  isbn?: string;
  publishedDate?: string;
  series?: string;
  seriesNumber?: number;
  coverImageUrl?: string;
  translatedAt?: string;
}

// === Project ===

export interface Project {
  id: string;
  name: string;
  type?: 'text' | 'book';
  sourceLanguage: string;
  targetLanguage: string;
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  settings: ProjectSettings;
  metadata?: ProjectMetadata;
  createdAt: string;
  updatedAt: string;
}

// === Project List Item (summary) ===

export interface ProjectListItem {
  id: string;
  name: string;
  type?: 'text' | 'book';
  chapterCount: number;
  translatedCount: number;
  glossaryCount: number;
  originalReadingMode?: boolean; // Flag for projects in original reading mode
  createdAt: string;
  updatedAt: string;
  metadata?: ProjectMetadata;
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
  /** Max file size in bytes for chapter uploads (from server config). */
  maxFileSizeBytes?: number;
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

export type ImportJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type ImportJobPhase = 'parsing' | 'saving' | 'finalizing';

export interface ImportJobChapter {
  number: number;
  title: string;
}

export interface ImportJobState {
  jobId: string;
  status: ImportJobStatus;
  phase: ImportJobPhase | null;
  format: 'epub' | 'fb2' | 'csv';
  filename: string;
  current: number;
  total: number;
  progress: number;
  currentChapterTitle?: string;
  warnings: string[];
  errors: string[];
  chapters: ImportJobChapter[];
  startedAt: string;
  finishedAt: string | null;
}

export type AnalysisJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type AnalysisChapterStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface AnalysisJobChapter {
  chapterId: string;
  title: string;
  status: AnalysisChapterStatus;
  tokensUsed?: number;
}

export interface AnalysisJobState {
  jobId: string;
  status: AnalysisJobStatus;
  current: number;
  total: number;
  progress: number;
  currentChapterTitle?: string;
  chapters: AnalysisJobChapter[];
  totalTokensUsed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
}

export type TranslateJobStatus = 'queued' | 'processing' | 'completed' | 'error' | 'canceled';
export type TranslateChapterStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface TranslateJobChapter {
  chapterId: string;
  title: string;
  status: TranslateChapterStatus;
  tokensUsed?: number;
  tokensByStage?: {
    analysis?: number;
    translation?: number;
    editing?: number;
  };
  duration?: number;
}

export interface TranslateJobState {
  jobId: string;
  status: TranslateJobStatus;
  current: number;
  total: number;
  progress: number;
  currentChapterTitle?: string;
  /** Chunk progress within current chapter (for polling backoff reset) */
  currentChapterChunksDone?: number;
  currentChapterTotalChunks?: number;
  chapters: TranslateJobChapter[];
  totalTokensUsed: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
}

/** Unified job item from GET /api/projects/:projectId/jobs */
export type ProjectJobItem =
  | ({ type: 'analysis' } & Omit<AnalysisJobState, 'projectId' | 'userId' | 'cancelRequested'>)
  | ({ type: 'translate' } & Omit<TranslateJobState, 'projectId' | 'userId' | 'cancelRequested'>);

export interface ProjectJobsResponse {
  jobs: ProjectJobItem[];
}

/** Options for chapter translate API and hooks (scope + stages). */
export type TranslationStageKind = 'analysis' | 'translation' | 'editing';

/** Stages to run: array (multi-select) or 'all'. */
export type TranslationStages = TranslationStageKind[] | 'all';

export interface ChapterTranslationOptions {
  translateOnlyEmpty?: boolean;
  paragraphIds?: string[];
  stages?: TranslationStages;
}

export interface BulkUpdateResponse {
  updated: number;
  paragraphs: Paragraph[];
}

export type MarkTranslatedBatchStatus = 'success' | 'failed' | 'skipped';

export interface MarkTranslatedBatchResultItem {
  chapterId: string;
  status: MarkTranslatedBatchStatus;
  reason?: string;
}

export interface MarkTranslatedBatchSummary {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
}

export interface MarkTranslatedBatchResponse {
  summary: MarkTranslatedBatchSummary;
  results: MarkTranslatedBatchResultItem[];
}

// === Auth ===

/** User role from profiles; guest when not authenticated. */
export type UserRole = 'guest' | 'user' | 'author' | 'author_plus' | 'super_author' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  /** Role from profile; defaults to 'user' when missing (backward compat). */
  role?: UserRole;
  /** Avatar URL from profile; optional. */
  avatarUrl?: string | null;
}

// === Token Usage ===

export interface TokenUsage {
  date: string;
  tokensUsed: number;
  /** Tokens reserved for in-progress jobs (count toward limit) */
  tokensBlocked: number;
  tokensLimit: number;
  tokensRemaining: number;
  percentageUsed: number;
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  };
  warning: boolean;
}

export interface TokenUsageHistory {
  history: Array<{
    date: string;
    tokensUsed: number;
    tokensLimit: number;
  }>;
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

// === Publications (public catalog) ===

export type PublicationStatus = 'draft' | 'published' | 'unpublished';

export interface Publication {
  id: string;
  projectId: string;
  userId: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplay: string | null;
  translatorDisplay: string | null;
  /** Entity ID for rich display (photo, description) on publication page. */
  authorEntityId?: string | null;
  /** Entity ID for rich display (photo, description) on publication page. */
  translatorEntityId?: string | null;
  /** Tag entity IDs for display on publication page. */
  tagEntityIds?: string[];
  sourceLanguage: string;
  targetLanguage: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** SEO-friendly URL path (e.g. zenit-koldovstva). Use for links when available. */
  slug?: string | null;
  /** Number of translated chapters (when loaded from list/user APIs). */
  translatedChapterCount?: number;
}

export interface PublicationListItem {
  id: string;
  projectId: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplay: string | null;
  translatorDisplay: string | null;
  /** Entity ID for clickable author link to catalog filter. */
  authorEntityId?: string | null;
  /** Entity ID for clickable translator link to catalog filter. */
  translatorEntityId?: string | null;
  /** Tag entity IDs (for future tag display on cards). */
  tagEntityIds?: string[];
  sourceLanguage: string;
  targetLanguage: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slug?: string | null;
  /** Number of translated chapters (from publications_list_with_counts view). */
  translatedChapterCount?: number;
}

export interface PublicationWithChapters extends Publication {
  chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
  /** Number of glossary entries (for showing Glossary button on publication). */
  glossaryCount?: number;
}
