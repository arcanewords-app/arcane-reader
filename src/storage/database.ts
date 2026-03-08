/**
 * Database layer using LowDB
 *
 * LowDB - простая JSON база данных для Node.js
 * Данные сохраняются в файл и переживают перезапуск сервера
 */

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger.js';

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
  isbn?: string;
  series?: string;
  seriesNumber?: number;
  publishedDate?: string;

  // Future: web-specific, document-specific fields can be added here
  // webUrl?: string; // For 'web' type
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
  status: ChapterStatus;
  hasTranslation: boolean;
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
  | 'completed'
  | 'error';

/** Lightweight chapter for list view (no paragraphs, no text) */
export interface ChapterListItem {
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  hasTranslation: boolean;
  translationMeta?: Chapter['translationMeta'];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
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
  imageUrls?: string[]; // Array of image file paths for gallery
  // Legacy support: keep imageUrl for backward compatibility
  imageUrl?: string;
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

/** Default reader settings */
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
  /** Custom instructions for translator and editor stages */
  customInstructions?: CustomInstructions;
  /** Editing style preset: default, literary, minimal */
  editingStylePreset?: 'default' | 'literary' | 'minimal';
}

export interface DatabaseSchema {
  projects: Project[];
  settings: {
    lastOpenedProject?: string;
  };
}

// Default data
const defaultData: DatabaseSchema = {
  projects: [],
  settings: {},
};

// Database instance
let db: Low<DatabaseSchema> | null = null;

/**
 * Initialize database
 */
export async function initDatabase(dataDir: string = './data'): Promise<Low<DatabaseSchema>> {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'arcane-db.json');
  const adapter = new JSONFile<DatabaseSchema>(dbPath);
  db = new Low(adapter, defaultData);

  // Read existing data
  await db.read();

  // Initialize with defaults if empty
  db.data ||= defaultData;

  logger.info(
    { dbPath, projectsCount: db.data.projects.length },
    `Database initialized: ${dbPath} (${db.data.projects.length} projects)`
  );

  return db;
}

/**
 * Get database instance
 */
export function getDb(): Low<DatabaseSchema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// ============ Project Operations ============

export async function getAllProjects(): Promise<Project[]> {
  const db = getDb();
  return db.data.projects;
}

/**
 * Migrate legacy glossary entry data
 */
function migrateGlossaryEntry(entry: GlossaryEntry): GlossaryEntry {
  // Migrate imageUrl to imageUrls array
  if (entry.imageUrl && (!entry.imageUrls || entry.imageUrls.length === 0)) {
    entry.imageUrls = [entry.imageUrl];
  }
  return entry;
}

/**
 * Migrate project settings from legacy single model to per-stage models
 */
function migrateProjectSettings(settings: ProjectSettings): ProjectSettings {
  // If stageModels already exists, no migration needed
  if (settings.stageModels) {
    return settings;
  }

  // Migrate from legacy model field (free-tier models only)
  const legacyModel = settings.model || 'gpt-4.1-mini';
  const freeModels = [
    'gpt-5.1-codex-mini',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o-mini',
    'o1-mini',
    'o3-mini',
    'o4-mini',
    'codex-mini-latest',
  ];
  const isFreeModel = freeModels.includes(legacyModel);
  const model = isFreeModel ? legacyModel : 'gpt-4.1-mini';
  const isCheapModel = model.includes('nano') || model.includes('mini');

  settings.stageModels = {
    analysis: isCheapModel ? model : 'gpt-4.1-mini',
    translation: model,
    editing: isCheapModel ? model : 'gpt-4.1-mini',
  };

  // Remove legacy model field (but keep it for backward compatibility in type)
  // Don't delete it, just ensure stageModels is set

  return settings;
}

/**
 * Reset stuck chapters (translating status for too long)
 * This is a fallback mechanism for when translation is cancelled or interrupted
 */
export async function resetStuckChapters(projectId?: string): Promise<number> {
  const db = getDb();
  const STUCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  let resetCount = 0;

  const projects = projectId
    ? db.data.projects.filter((p) => p.id === projectId)
    : db.data.projects;

  for (const project of projects) {
    for (const chapter of project.chapters) {
      if (chapter.status === 'translating') {
        let isStuck = false;

        // If translationMeta exists with translatedAt, check if it's old
        // (translatedAt should not exist for active translations, but check anyway)
        if (chapter.translationMeta?.translatedAt) {
          const translatedAt = new Date(chapter.translationMeta.translatedAt).getTime();
          isStuck = Date.now() - translatedAt > STUCK_TIMEOUT;
        } else {
          // If no translationMeta, this means translation just started
          // Check project updatedAt - if it's old, translation is likely stuck
          // Also reset if project wasn't updated in last 30 minutes
          const projectUpdated = new Date(project.updatedAt).getTime();
          const timeSinceUpdate = Date.now() - projectUpdated;

          // If project wasn't updated recently (more than timeout), assume stuck
          // This handles cases where translation was cancelled/interrupted
          isStuck = timeSinceUpdate > STUCK_TIMEOUT;
        }

        if (isStuck) {
          chapter.status = 'pending';
          resetCount++;
          logger.info(
            { chapterId: chapter.id, chapterTitle: chapter.title, projectName: project.name },
            `Reset stuck status: ${chapter.title} (project: ${project.name})`
          );
        }
      }
    }
  }

  if (resetCount > 0) {
    await db.write();
  }

  return resetCount;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === id);

  if (project) {
    // Check and reset stuck chapters for this project
    await resetStuckChapters(id);

    // Migrate glossary entries
    let needsSave = false;
    for (const entry of project.glossary) {
      const before = JSON.stringify(entry);
      migrateGlossaryEntry(entry);
      const after = JSON.stringify(entry);
      if (before !== after) {
        needsSave = true;
      }
    }

    // Migrate project settings (legacy model -> stageModels)
    const beforeSettings = JSON.stringify(project.settings);
    migrateProjectSettings(project.settings);
    const afterSettings = JSON.stringify(project.settings);
    if (beforeSettings !== afterSettings) {
      needsSave = true;
    }

    // Save if migration occurred
    if (needsSave) {
      project.updatedAt = new Date().toISOString();
      await db.write();
    }
  }

  return project;
}

export async function createProject(data: {
  name: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): Promise<Project> {
  const db = getDb();

  const project: Project = {
    id: generateId(),
    name: data.name || 'Новый проект',
    type: 'text', // Default type, will be updated when first file is uploaded
    sourceLanguage: data.sourceLanguage || 'en',
    targetLanguage: data.targetLanguage || 'ru',
    chapters: [],
    glossary: [],
    settings: {
      // Default models: optimized for cost/quality using promotional models
      stageModels: {
        analysis: 'gpt-4.1-mini', // Price/quality balance, analysis and editing
        translation: 'gpt-4.1-mini', // Price/quality balance for all stages
        editing: 'gpt-4.1-mini', // Price/quality balance for polishing
      },
      temperature: 0.7,
      enableAnalysis: true,
      enableTranslation: true,
      enableEditing: true,
      includeGlossaryInAnalysis: true,
      includeGlossaryInTranslation: true,
      includeGlossaryInEditing: true,
      reader: { ...DEFAULT_READER_SETTINGS },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.data.projects.push(project);
  await db.write();

  logger.info(
    { event: 'project.created', projectId: project.id, projectName: project.name },
    `Project created: ${project.name} (${project.id})`
  );

  return project;
}

export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<Project | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === id);

  if (!project) return undefined;

  Object.assign(project, updates, { updatedAt: new Date().toISOString() });
  await db.write();

  return project;
}

/**
 * Update reader settings for a project
 */
export async function updateReaderSettings(
  projectId: string,
  updates: Partial<ReaderSettings>
): Promise<ReaderSettings | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);

  if (!project) return undefined;

  // Ensure reader settings exist and have all fields (migration for old projects)
  if (!project.settings.reader) {
    project.settings.reader = { ...DEFAULT_READER_SETTINGS };
  }
  const reader = project.settings.reader;

  // Migrate legacy reader: ensure all new fields exist
  const defaults = DEFAULT_READER_SETTINGS;
  if (reader.textIndent === undefined) reader.textIndent = defaults.textIndent;
  if (reader.textAlign === undefined) reader.textAlign = defaults.textAlign;
  if (reader.hideChapterHeader === undefined) reader.hideChapterHeader = defaults.hideChapterHeader;
  if (reader.containerWidth === undefined) reader.containerWidth = defaults.containerWidth;
  if (reader.paragraphSpacing === undefined) {
    reader.paragraphSpacing = defaults.paragraphSpacing;
  } else if (reader.paragraphSpacing > 2) {
    /* Legacy px (3-24): convert to em */
    reader.paragraphSpacing = Math.min(2, reader.paragraphSpacing / 16);
  }
  const legacyFont = LEGACY_FONT_MAP[reader.fontFamily as string];
  if (legacyFont) reader.fontFamily = legacyFont;

  if (updates.fontFamily) reader.fontFamily = updates.fontFamily;
  if (updates.fontSize !== undefined) {
    reader.fontSize = Math.max(14, Math.min(24, updates.fontSize));
  }
  if (updates.lineHeight !== undefined) {
    reader.lineHeight = Math.max(1.4, Math.min(2.0, updates.lineHeight));
  }
  if (updates.colorScheme !== undefined) reader.colorScheme = updates.colorScheme;
  if (updates.customBg !== undefined) reader.customBg = updates.customBg;
  if (updates.customText !== undefined) reader.customText = updates.customText;
  if (updates.textIndent !== undefined) reader.textIndent = updates.textIndent;
  if (updates.textAlign !== undefined) reader.textAlign = updates.textAlign;
  if (updates.hideChapterHeader !== undefined) reader.hideChapterHeader = updates.hideChapterHeader;
  if (updates.paragraphSpacing !== undefined) {
    reader.paragraphSpacing = Math.max(0, Math.min(2, updates.paragraphSpacing));
  }
  if (updates.containerWidth !== undefined) {
    reader.containerWidth = Math.max(50, Math.min(100, updates.containerWidth));
  }

  project.updatedAt = new Date().toISOString();
  await db.write();

  return reader;
}

/**
 * Get reader settings for a project (with defaults for old projects).
 * Accepts Project or ProjectWithChapterList - only settings.reader is used.
 */
export function getReaderSettings(
  project: Project | { settings: ProjectSettings }
): ReaderSettings {
  const raw = project.settings.reader;
  if (!raw) return { ...DEFAULT_READER_SETTINGS };

  let fontFamily = raw.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily;
  const legacyMapped = LEGACY_FONT_MAP[fontFamily as string];
  if (legacyMapped) fontFamily = legacyMapped;

  // paragraphSpacing: em 0-2.0. Legacy px (3-24) converted on write; old em (0.5-2) kept as is.
  let paragraphSpacing = raw.paragraphSpacing ?? DEFAULT_READER_SETTINGS.paragraphSpacing;
  if (paragraphSpacing > 2) paragraphSpacing = Math.min(2, paragraphSpacing / 16);

  const merged: ReaderSettings = {
    ...DEFAULT_READER_SETTINGS,
    fontFamily,
    fontSize: raw.fontSize ?? DEFAULT_READER_SETTINGS.fontSize,
    lineHeight: raw.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight,
    colorScheme: raw.colorScheme ?? DEFAULT_READER_SETTINGS.colorScheme,
    textIndent: raw.textIndent ?? DEFAULT_READER_SETTINGS.textIndent,
    textAlign: raw.textAlign ?? DEFAULT_READER_SETTINGS.textAlign,
    hideChapterHeader: raw.hideChapterHeader ?? DEFAULT_READER_SETTINGS.hideChapterHeader,
    paragraphSpacing,
    containerWidth: raw.containerWidth ?? DEFAULT_READER_SETTINGS.containerWidth,
  };
  if (raw.customBg != null) merged.customBg = raw.customBg;
  if (raw.customText != null) merged.customText = raw.customText;

  return merged;
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  const index = db.data.projects.findIndex((p) => p.id === id);

  if (index === -1) return false;

  const [removed] = db.data.projects.splice(index, 1);
  await db.write();

  logger.info(
    { event: 'project.deleted', projectName: removed.name },
    `Project deleted: ${removed.name}`
  );

  return true;
}

// ============ Chapter Operations ============

export async function addChapter(
  projectId: string,
  data: { title: string; originalText: string }
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);

  if (!project) return undefined;

  // Parse text into paragraphs
  const paragraphs = parseTextToParagraphs(data.originalText);

  const chapter: Chapter = {
    id: generateId(),
    number: project.chapters.length + 1,
    title: data.title,
    originalText: data.originalText,
    paragraphs,
    status: 'pending',
  };

  project.chapters.push(chapter);
  project.updatedAt = new Date().toISOString();
  await db.write();

  logger.info(
    {
      event: 'chapter.added',
      projectId,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      projectName: project.name,
      paragraphsCount: paragraphs.length,
    },
    `Chapter added: ${chapter.title} -> ${project.name} (${paragraphs.length} paragraphs)`
  );

  return chapter;
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  updates: Partial<Chapter>
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return undefined;

  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (!chapter) return undefined;

  Object.assign(chapter, updates);
  project.updatedAt = new Date().toISOString();
  await db.write();

  return chapter;
}

export async function getChapter(
  projectId: string,
  chapterId: string
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return undefined;

  const chapter = project.chapters.find((c) => c.id === chapterId);

  // Auto-sync: if chapter has translatedChunks but paragraphs are not synced,
  // attempt to sync them automatically (recovery mechanism)
  if (chapter && chapter.translatedChunks && chapter.translatedChunks.length > 0) {
    // If chunks exist but no paragraphs have translations, this is likely unsynced
    // However, we don't auto-sync here to avoid side effects.
    // Sync should happen automatically after translation, or manually via /sync endpoint.
    // This is just a check - actual sync happens in server.ts after translation.
  }

  return chapter;
}

export async function deleteChapter(projectId: string, chapterId: string): Promise<boolean> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return false;

  const index = project.chapters.findIndex((c) => c.id === chapterId);
  if (index === -1) return false;

  const [removed] = project.chapters.splice(index, 1);

  // Renumber remaining chapters
  project.chapters.forEach((ch, idx) => {
    ch.number = idx + 1;
  });

  project.updatedAt = new Date().toISOString();
  await db.write();

  logger.info(
    { event: 'chapter.deleted', chapterTitle: removed.title },
    `Chapter deleted: ${removed.title}`
  );

  return true;
}

/**
 * Update chapter number and renumber other chapters accordingly
 * @param projectId Project ID
 * @param chapterId Chapter ID to update
 * @param newNumber New chapter number (1-based)
 * @returns Updated chapter or undefined if not found
 */
export async function updateChapterNumber(
  projectId: string,
  chapterId: string,
  newNumber: number
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return undefined;

  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (!chapter) return undefined;

  const oldNumber = chapter.number;
  const maxNumber = project.chapters.length;

  // Validate new number
  if (newNumber < 1 || newNumber > maxNumber) {
    throw new Error(`Номер главы должен быть от 1 до ${maxNumber}`);
  }

  // If number hasn't changed, return early
  if (newNumber === oldNumber) {
    return chapter;
  }

  // Sort chapters by current number to maintain order
  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);

  // Remove chapter from its current position
  const chapterIndex = sortedChapters.findIndex((c) => c.id === chapterId);
  sortedChapters.splice(chapterIndex, 1);

  // Insert chapter at new position
  sortedChapters.splice(newNumber - 1, 0, chapter);

  // Renumber all chapters sequentially
  sortedChapters.forEach((ch, idx) => {
    ch.number = idx + 1;
  });

  // Update project chapters array (maintain original order but update numbers)
  project.chapters.forEach((ch) => {
    const updated = sortedChapters.find((sc) => sc.id === ch.id);
    if (updated) {
      ch.number = updated.number;
    }
  });

  project.updatedAt = new Date().toISOString();
  await db.write();

  logger.info(
    {
      event: 'chapter.number_updated',
      chapterId,
      chapterTitle: chapter.title,
      oldNumber,
      newNumber,
    },
    `Chapter number changed: "${chapter.title}" ${oldNumber} → ${newNumber}`
  );

  return chapter;
}

// ============ Glossary Operations ============

export async function addGlossaryEntry(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id'>
): Promise<GlossaryEntry | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);

  if (!project) return undefined;

  const glossaryEntry: GlossaryEntry = {
    id: generateId(),
    ...entry,
  };

  project.glossary.push(glossaryEntry);
  project.updatedAt = new Date().toISOString();
  await db.write();

  return glossaryEntry;
}

export async function updateGlossaryEntry(
  projectId: string,
  entryId: string,
  updates: Partial<GlossaryEntry>
): Promise<GlossaryEntry | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return undefined;

  const entry = project.glossary.find((e) => e.id === entryId);
  if (!entry) return undefined;

  // Migrate legacy imageUrl to imageUrls if needed
  if (updates.imageUrls === undefined && entry.imageUrl && !entry.imageUrls) {
    entry.imageUrls = [entry.imageUrl];
  }

  Object.assign(entry, updates);
  project.updatedAt = new Date().toISOString();
  await db.write();

  return entry;
}

export async function deleteGlossaryEntry(projectId: string, entryId: string): Promise<boolean> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return false;

  const index = project.glossary.findIndex((e) => e.id === entryId);
  if (index === -1) return false;

  project.glossary.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  await db.write();

  return true;
}

// ============ Paragraph Operations ============

/**
 * Check if a paragraph is a separator (e.g., ***, ---, ___, etc.)
 * Separators are typically used to divide sections in text
 */
function isSeparatorParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Check if paragraph contains only separator characters (repeated)
  // Common separators: *, -, _, =, ~, #, etc.
  const separatorPattern = /^[\s*\-_=~#]+$/;
  return separatorPattern.test(trimmed);
}

/**
 * Parse text into paragraphs
 * Splits by double newlines, filters empty paragraphs and separators
 */
export function parseTextToParagraphs(text: string): Paragraph[] {
  // Split by double newlines (standard paragraph separator)
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    // Filter out separator paragraphs (e.g., ***, ---, etc.)
    .filter((p) => !isSeparatorParagraph(p));

  return rawParagraphs.map((content, index) => ({
    id: generateId(),
    index,
    originalText: content,
    status: 'pending' as ParagraphStatus,
  }));
}

/**
 * Merge paragraphs back into single text
 */
export function mergeParagraphsToText(
  paragraphs: Paragraph[],
  field: 'originalText' | 'translatedText' = 'translatedText'
): string {
  return paragraphs
    .sort((a, b) => a.index - b.index)
    .map((p) => p[field] || '')
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * Update single paragraph in chapter
 */
export async function updateParagraph(
  projectId: string,
  chapterId: string,
  paragraphId: string,
  updates: Partial<Paragraph>
): Promise<Paragraph | undefined> {
  const db = getDb();
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return undefined;

  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (!chapter) return undefined;

  const paragraph = chapter.paragraphs.find((p) => p.id === paragraphId);
  if (!paragraph) return undefined;

  Object.assign(paragraph, updates);

  // If translated text updated, sync to chapter translatedText
  // This keeps chapter.translatedText in sync with paragraphs for reading mode
  if (updates.translatedText !== undefined) {
    const mergedText = mergeParagraphsToText(chapter.paragraphs);
    chapter.translatedText = mergedText;

    // Also update translatedChunks to keep them in sync
    // This ensures consistency between paragraphs and chunks
    if (mergedText) {
      const chunks = mergedText
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);
      chapter.translatedChunks = chunks;
    }
  }

  project.updatedAt = new Date().toISOString();
  await db.write();

  return paragraph;
}

/**
 * Get chapter completion stats
 */
export function getChapterStats(chapter: Chapter): {
  total: number;
  pending: number;
  translated: number;
  edited: number;
  approved: number;
  progress: number;
} {
  const paragraphs = chapter.paragraphs || [];
  const total = paragraphs.length;

  if (total === 0) {
    return { total: 0, pending: 0, translated: 0, edited: 0, approved: 0, progress: 0 };
  }

  const counts = {
    pending: 0,
    translated: 0,
    edited: 0,
    approved: 0,
  };

  for (const p of paragraphs) {
    counts[p.status]++;
  }

  // Progress = (translated + edited + approved) / total
  const completed = counts.translated + counts.edited + counts.approved;
  const progress = Math.round((completed / total) * 100);

  return { total, ...counts, progress };
}

// ============ Helpers ============

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
