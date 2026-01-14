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

// Types
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
export type ChapterStatus = 'pending' | 'translating' | 'completed' | 'error';

export interface Chapter {
  id: string;
  number: number;
  title: string;
  // Raw text (kept for compatibility and full-text operations)
  originalText: string;
  translatedText?: string;
  // Structured paragraphs for editing
  paragraphs: Paragraph[];
  status: ChapterStatus;
  translationMeta?: {
    tokensUsed: number;
    duration: number;
    model: string;
    translatedAt: string;
  };
}

export interface GlossaryEntry {
  id: string;
  type: 'character' | 'location' | 'term';
  original: string;
  translated: string;
  gender?: 'male' | 'female' | 'neutral';
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
  imageUrls?: string[]; // Array of image file paths for gallery
  // Legacy support: keep imageUrl for backward compatibility
  imageUrl?: string;
}

/** Font family options for reader */
export type FontFamily = 'literary' | 'serif' | 'sans' | 'mono';

/** Color scheme options */
export type ColorScheme = 'dark' | 'light' | 'sepia' | 'contrast';

/** Reader display settings */
export interface ReaderSettings {
  // Typography
  fontFamily: FontFamily;
  fontSize: number;      // 14-24px
  lineHeight: number;    // 1.4-2.0
  
  // Colors
  colorScheme: ColorScheme;
  
  // Spacing
  paragraphSpacing: number;  // 0.5-2.0em
}

/** Default reader settings */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: 'literary',
  fontSize: 18,
  lineHeight: 1.7,
  colorScheme: 'dark',
  paragraphSpacing: 1.2,
};

export interface ProjectSettings {
  // Legacy: single model (for backward compatibility)
  model?: string;
  
  // Per-stage model configuration
  stageModels?: {
    analysis: string;    // Stage 1: Extract entities, analyze style
    translation: string; // Stage 2: Translate (required)
    editing: string;     // Stage 3: Polish and refine
  };
  
  temperature: number;
  // Pipeline stages control
  enableAnalysis: boolean;   // Stage 1: Extract entities, analyze style
  enableTranslation: boolean; // Stage 2: Translate (always true, required)
  enableEditing: boolean;     // Stage 3: Polish and refine
  // Reader display settings
  reader: ReaderSettings;
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
  
  console.log(`📦 База данных инициализирована: ${dbPath}`);
  console.log(`   Проектов: ${db.data.projects.length}`);
  
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
  
  // Migrate from legacy model field
  const legacyModel = settings.model || 'gpt-4-turbo-preview';
  
  // Create stageModels with sensible defaults based on legacy model
  // If legacy model was cheap, use it for all stages
  // If legacy model was expensive, use cheaper alternatives for analysis/editing
  const isCheapModel = legacyModel.includes('3.5') || legacyModel.includes('mini');
  
  settings.stageModels = {
    analysis: isCheapModel ? legacyModel : 'gpt-4o-mini',
    translation: legacyModel, // Keep original model for translation
    editing: isCheapModel ? legacyModel : 'gpt-4-turbo-preview',
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
    ? db.data.projects.filter(p => p.id === projectId)
    : db.data.projects;
  
  for (const project of projects) {
    for (const chapter of project.chapters) {
      if (chapter.status === 'translating') {
        let isStuck = false;
        
        // If translationMeta exists with translatedAt, check if it's old
        // (translatedAt should not exist for active translations, but check anyway)
        if (chapter.translationMeta?.translatedAt) {
          const translatedAt = new Date(chapter.translationMeta.translatedAt).getTime();
          isStuck = (Date.now() - translatedAt) > STUCK_TIMEOUT;
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
          console.log(`🔄 Сброшен застрявший статус: ${chapter.title} (проект: ${project.name})`);
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
  const project = db.data.projects.find(p => p.id === id);
  
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
    sourceLanguage: data.sourceLanguage || 'en',
    targetLanguage: data.targetLanguage || 'ru',
    chapters: [],
    glossary: [],
    settings: {
      // Default models: optimized for cost/quality using promotional models
      stageModels: {
        analysis: 'gpt-4.1-mini',     // Best price/quality for structured JSON output
        translation: 'gpt-5-mini',     // Best quality for main translation (if available)
        editing: 'gpt-4.1-mini',       // Good balance for polishing
      },
      temperature: 0.7,
      enableAnalysis: true,
      enableTranslation: true,
      enableEditing: true,
      reader: { ...DEFAULT_READER_SETTINGS },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  db.data.projects.push(project);
  await db.write();
  
  console.log(`📁 Создан проект: ${project.name} (${project.id})`);
  
  return project;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === id);
  
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
  const project = db.data.projects.find(p => p.id === projectId);
  
  if (!project) return undefined;
  
  // Ensure reader settings exist (migration for old projects)
  if (!project.settings.reader) {
    project.settings.reader = { ...DEFAULT_READER_SETTINGS };
  }
  
  // Merge updates with validation
  const reader = project.settings.reader;
  
  if (updates.fontFamily) reader.fontFamily = updates.fontFamily;
  if (updates.fontSize !== undefined) {
    reader.fontSize = Math.max(14, Math.min(24, updates.fontSize));
  }
  if (updates.lineHeight !== undefined) {
    reader.lineHeight = Math.max(1.4, Math.min(2.0, updates.lineHeight));
  }
  if (updates.colorScheme) reader.colorScheme = updates.colorScheme;
  if (updates.paragraphSpacing !== undefined) {
    reader.paragraphSpacing = Math.max(0.5, Math.min(2.0, updates.paragraphSpacing));
  }
  
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return reader;
}

/**
 * Get reader settings for a project (with defaults for old projects)
 */
export function getReaderSettings(project: Project): ReaderSettings {
  return project.settings.reader || { ...DEFAULT_READER_SETTINGS };
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  const index = db.data.projects.findIndex(p => p.id === id);
  
  if (index === -1) return false;
  
  const [removed] = db.data.projects.splice(index, 1);
  await db.write();
  
  console.log(`🗑️ Удалён проект: ${removed.name}`);
  
  return true;
}

// ============ Chapter Operations ============

export async function addChapter(
  projectId: string,
  data: { title: string; originalText: string }
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  
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
  
  console.log(`📖 Добавлена глава: ${chapter.title} -> ${project.name} (${paragraphs.length} абзацев)`);
  
  return chapter;
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  updates: Partial<Chapter>
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  const chapter = project.chapters.find(c => c.id === chapterId);
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
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  return project.chapters.find(c => c.id === chapterId);
}

export async function deleteChapter(
  projectId: string,
  chapterId: string
): Promise<boolean> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return false;
  
  const index = project.chapters.findIndex(c => c.id === chapterId);
  if (index === -1) return false;
  
  const [removed] = project.chapters.splice(index, 1);
  
  // Renumber remaining chapters
  project.chapters.forEach((ch, idx) => {
    ch.number = idx + 1;
  });
  
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  console.log(`🗑️ Удалена глава: ${removed.title}`);
  
  return true;
}

// ============ Glossary Operations ============

export async function addGlossaryEntry(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id'>
): Promise<GlossaryEntry | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  
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
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  const entry = project.glossary.find(e => e.id === entryId);
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

export async function deleteGlossaryEntry(
  projectId: string,
  entryId: string
): Promise<boolean> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return false;
  
  const index = project.glossary.findIndex(e => e.id === entryId);
  if (index === -1) return false;
  
  project.glossary.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return true;
}

// ============ Paragraph Operations ============

/**
 * Parse text into paragraphs
 * Splits by double newlines, filters empty paragraphs
 */
export function parseTextToParagraphs(text: string): Paragraph[] {
  // Split by double newlines (standard paragraph separator)
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
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
    .map(p => p[field] || '')
    .filter(text => text.length > 0)
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
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  const chapter = project.chapters.find(c => c.id === chapterId);
  if (!chapter) return undefined;
  
  const paragraph = chapter.paragraphs.find(p => p.id === paragraphId);
  if (!paragraph) return undefined;
  
  Object.assign(paragraph, updates);
  
  // If translated text updated, sync to chapter translatedText
  if (updates.translatedText !== undefined) {
    chapter.translatedText = mergeParagraphsToText(chapter.paragraphs);
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

