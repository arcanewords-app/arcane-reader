/**
 * Supabase Database Service
 *
 * Replaces LowDB operations with Supabase PostgreSQL queries
 * All functions maintain the same interface as database.ts for compatibility
 */

import { supabase, createClientWithToken } from './supabaseClient.js';
import { validateToken } from '../utils/tokenValidation.js';
import { titleToSlug } from '../utils/slug.js';
import type { SupabaseClient } from '@supabase/supabase-js';

async function ensureUniqueSlug(
  client: SupabaseClient,
  baseSlug: string,
  excludePublicationId: string | null
): Promise<string> {
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    let query = client.from('publications').select('id').eq('slug', slug);
    if (excludePublicationId) {
      query = query.neq('id', excludePublicationId);
    }
    const { data: existing } = await query.maybeSingle();
    if (!existing) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 100) return baseSlug + '-' + Date.now().toString(36);
  }
}

import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  ChapterListItem,
  ChapterSummary,
  GlossaryEntry,
  Paragraph,
  ProjectSettings,
  ReaderSettings,
  ChapterStatus,
  ParagraphStatus,
} from '../storage/database.js';
import {
  parseTextToParagraphs,
  mergeParagraphsToText,
  DEFAULT_READER_SETTINGS,
  getReaderSettings as getReaderSettingsFromStorage,
  LEGACY_FONT_MAP,
} from '../storage/database.js';
import { logger } from '../logger.js';

// ============================================
// Type Transformations (DB snake_case <-> App camelCase)
// ============================================

// --- Glossary entry enum normalization (DB check constraints + LLM/API input) ---
// See docs/GLOSSARY_LLM_NORMALIZATION.md for what the LLM can return and what we normalize.

/** Allowed values for glossary_entries.gender (DB check constraint) */
const ALLOWED_GENDERS = ['male', 'female', 'neutral', 'unknown'] as const;
type AllowedGender = (typeof ALLOWED_GENDERS)[number];

/**
 * Normalize gender to a value allowed by glossary_entries_gender_check.
 * LLM may return "masculine", "f", "Female", "" etc. — we coerce to allowed or null.
 */
function normalizeGenderForDB(value: unknown): AllowedGender | null {
  if (value == null || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'masculine') return 'male';
  if (s === 'female' || s === 'f' || s === 'feminine') return 'female';
  if (s === 'neutral' || s === 'n' || s === 'other' || s === 'non-binary') return 'neutral';
  if (s === 'unknown' || s === 'u') return 'unknown';
  if (ALLOWED_GENDERS.includes(s as AllowedGender)) return s as AllowedGender;
  return null;
}

/** Allowed values for glossary_entries.type (entry kind: character/location/term) */
const ALLOWED_ENTRY_TYPES = ['character', 'location', 'term'] as const;
type AllowedEntryType = (typeof ALLOWED_ENTRY_TYPES)[number];

/**
 * Normalize entry type. API/LLM might send "Character", "char", or typos.
 * Default to 'term' for unknown so insert doesn't fail.
 */
function normalizeGlossaryTypeForDB(value: unknown): AllowedEntryType {
  if (value == null || value === '') return 'term';
  const s = String(value).trim().toLowerCase();
  if (s === 'character' || s === 'char' || s === 'c') return 'character';
  if (s === 'location' || s === 'loc' || s === 'place' || s === 'l') return 'location';
  if (s === 'term' || s === 't') return 'term';
  if (ALLOWED_ENTRY_TYPES.includes(s as AllowedEntryType)) return s as AllowedEntryType;
  return 'term';
}

/**
 * Transform Supabase project row to ProjectWithChapterList (lightweight chapters)
 */
function transformProjectFromDBWithChapterList(
  row: Record<string, unknown>,
  chapters: ChapterListItem[] = [],
  glossary: GlossaryEntry[] = []
): ProjectWithChapterList {
  const r = row as Record<string, unknown> & {
    id: string;
    name: string;
    type?: string;
    metadata?: unknown;
    source_language?: string;
    target_language?: string;
    settings?: ProjectSettings;
    created_at?: string;
    updated_at?: string;
  };
  let projectType = (r.type as string) || 'text';
  if (!r.type && r.metadata) {
    projectType = 'book';
  }
  return {
    id: r.id,
    name: r.name,
    type: projectType,
    sourceLanguage: r.source_language ?? 'en',
    targetLanguage: r.target_language ?? 'ru',
    settings: (r.settings as ProjectSettings) || getDefaultProjectSettings(),
    metadata: r.metadata || undefined,
    chapters,
    glossary,
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  };
}

/**
 * Transform Supabase project row to Project type
 */
function transformProjectFromDB(
  row: Record<string, unknown>,
  chapters: Chapter[] = [],
  glossary: GlossaryEntry[] = []
): Project {
  const r = row as Record<string, unknown> & {
    id: string;
    name: string;
    type?: string;
    metadata?: unknown;
    source_language?: string;
    target_language?: string;
    settings?: ProjectSettings;
    created_at?: string;
    updated_at?: string;
  };
  let projectType = (r.type as string) || 'text';
  if (!r.type && r.metadata) {
    // If no type but has metadata, it's likely a book
    projectType = 'book';
  }

  return {
    id: r.id,
    name: r.name,
    type: projectType,
    sourceLanguage: r.source_language ?? 'en',
    targetLanguage: r.target_language ?? 'ru',
    settings: (r.settings as ProjectSettings) || getDefaultProjectSettings(),
    metadata: r.metadata || undefined,
    chapters,
    glossary,
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  };
}

/**
 * Transform Project to Supabase insert/update format
 */
function transformProjectToDB(project: Partial<Project>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: project.name,
    source_language: project.sourceLanguage,
    target_language: project.targetLanguage,
    settings: project.settings,
  };

  // Add type if provided
  if (project.type !== undefined) {
    result.type = project.type;
  }

  // Add metadata if provided
  if (project.metadata !== undefined) {
    result.metadata = project.metadata;
  }

  return result;
}

/**
 * Transform Supabase chapter row to Chapter type
 */
function transformChapterFromDB(
  row: Record<string, unknown>,
  paragraphs: Paragraph[] = []
): Chapter {
  const r = row as Record<string, unknown> & {
    id: string;
    number: number;
    title: string;
    original_text?: string;
    translated_text?: string;
    translated_chunks?: unknown;
    status: string;
    translation_meta?: unknown;
  };
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    originalText: r.original_text ?? '',
    translatedText: r.translated_text || undefined,
    translatedChunks: r.translated_chunks as Chapter['translatedChunks'] | undefined,
    status: r.status as ChapterStatus,
    translationMeta: r.translation_meta
      ? (r.translation_meta as Chapter['translationMeta'])
      : undefined,
    paragraphs,
  };
}

/**
 * Transform Chapter to Supabase insert/update format
 */
function transformChapterToDB(chapter: Partial<Chapter>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (chapter.number !== undefined) result.number = chapter.number;
  if (chapter.title !== undefined) result.title = chapter.title;
  if (chapter.originalText !== undefined) result.original_text = chapter.originalText;
  if (chapter.translatedText !== undefined) result.translated_text = chapter.translatedText;
  if (chapter.translatedChunks !== undefined) result.translated_chunks = chapter.translatedChunks;
  if (chapter.status !== undefined) result.status = chapter.status;
  if (chapter.translationMeta !== undefined) result.translation_meta = chapter.translationMeta;
  return result;
}

/**
 * Transform Supabase paragraph row to Paragraph type
 */
function transformParagraphFromDB(row: Record<string, unknown>): Paragraph {
  const r = row as Record<string, unknown> & {
    id: string;
    index: number;
    original_text?: string;
    translated_text?: string;
    status: string;
    edited_at?: string;
    edited_by?: string;
  };
  return {
    id: r.id,
    index: r.index,
    originalText: r.original_text ?? '',
    translatedText: r.translated_text || undefined,
    status: r.status as ParagraphStatus,
    editedAt: r.edited_at || undefined,
    editedBy: (r.edited_by as 'ai' | 'user') || undefined,
  };
}

/**
 * Transform Supabase glossary entry row to GlossaryEntry type
 */
function transformGlossaryEntryFromDB(row: Record<string, unknown>): GlossaryEntry {
  const r = row as Record<string, unknown> & {
    id: string;
    image_urls?: string[];
    image_url?: string;
    mentioned_in_chapters?: number[];
    [k: string]: unknown;
  };
  let imageUrls = (r.image_urls as string[]) || [];
  if (r.image_url && !imageUrls.includes(r.image_url as string)) {
    imageUrls = [r.image_url as string, ...imageUrls];
  }

  const mentionedInChapters = r.mentioned_in_chapters;
  const mentionedInChaptersArr =
    Array.isArray(mentionedInChapters) && mentionedInChapters.length > 0
      ? [...(mentionedInChapters as number[])].sort((a, b) => a - b)
      : undefined;

  return {
    id: r.id,
    type: r.type as 'character' | 'location' | 'term',
    original: r.original as string,
    translated: r.translated as string,
    gender: (r.gender as GlossaryEntry['gender']) || undefined,
    declensions: r.declensions ? (r.declensions as GlossaryEntry['declensions']) : undefined,
    description: (r.description as string) || undefined,
    notes: (r.notes as string) || undefined,
    firstAppearance: (() => {
      const fa = r.first_appearance;
      if (fa == null) return undefined;
      const num = typeof fa === 'number' ? fa : parseInt(String(fa), 10);
      return Number.isNaN(num) ? undefined : num;
    })(),
    mentionedInChapters: mentionedInChaptersArr,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined,
    autoDetected: (r.auto_detected as boolean) || false,
  };
}

/**
 * Get default project settings
 */
function getDefaultProjectSettings(): ProjectSettings {
  return {
    stageModels: {
      analysis: 'gpt-4.1-mini',
      translation: 'gpt-4.1-mini',
      editing: 'gpt-4.1-mini',
    },
    temperature: 0.5,
    enableAnalysis: true,
    enableTranslation: true,
    enableEditing: true,
    includeGlossaryInAnalysis: true,
    includeGlossaryInTranslation: true,
    includeGlossaryInEditing: true,
    reader: { ...DEFAULT_READER_SETTINGS },
  };
}

// ============================================
// Project Operations
// ============================================

/** Lightweight project list item (no chapters/paragraphs/glossary loaded) */
export interface ProjectListItemDB {
  id: string;
  name: string;
  type?: string;
  chapterCount: number;
  translatedCount: number;
  glossaryCount: number;
  originalReadingMode?: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: unknown;
}

/**
 * Get all projects for a user (lightweight - no chapters, paragraphs, or glossary).
 * Uses SQL counts instead of loading full data.
 */
export async function getAllProjectsLightweight(
  userId: string,
  token: string
): Promise<ProjectListItemDB[]> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: projects, error } = await client
    .from('projects')
    .select('id, name, type, settings, created_at, updated_at, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get projects: ${error.message}`);
  }

  if (!projects || projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((p) => p.id);

  const [chapterCounts, translatedCounts, glossaryCounts] = await Promise.all([
    getChapterCountsByProject(client, projectIds),
    getTranslatedChapterCountsByProject(client, projectIds),
    getGlossaryCountsByProject(client, projectIds),
  ]);

  return projects.map((p) => {
    const settings = (p.settings as ProjectSettings) || getDefaultProjectSettings();
    return {
      id: p.id,
      name: p.name,
      type: p.type || 'text',
      chapterCount: chapterCounts[p.id] ?? 0,
      translatedCount: translatedCounts[p.id] ?? 0,
      glossaryCount: glossaryCounts[p.id] ?? 0,
      originalReadingMode: settings?.originalReadingMode ?? false,
      createdAt: p.created_at ?? '',
      updatedAt: p.updated_at ?? '',
      metadata: p.metadata || undefined,
    };
  });
}

async function getChapterCountsByProject(
  client: ReturnType<typeof createClientWithToken>,
  projectIds: string[]
): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {};
  const { data, error } = await client
    .from('chapters')
    .select('project_id')
    .in('project_id', projectIds);
  if (error) throw new Error(`Failed to get chapter counts: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const pid = row.project_id as string;
    counts[pid] = (counts[pid] ?? 0) + 1;
  }
  return counts;
}

async function getTranslatedChapterCountsByProject(
  client: ReturnType<typeof createClientWithToken>,
  projectIds: string[]
): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {};
  const { data, error } = await client
    .from('chapters')
    .select('project_id')
    .eq('status', 'completed')
    .in('project_id', projectIds);
  if (error) throw new Error(`Failed to get translated chapter counts: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const pid = row.project_id as string;
    counts[pid] = (counts[pid] ?? 0) + 1;
  }
  return counts;
}

async function getGlossaryCountsByProject(
  client: ReturnType<typeof createClientWithToken>,
  projectIds: string[]
): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {};
  const { data, error } = await client
    .from('glossary_entries')
    .select('project_id')
    .in('project_id', projectIds);
  if (error) throw new Error(`Failed to get glossary counts: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const pid = row.project_id as string;
    counts[pid] = (counts[pid] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get all projects for a user
 * Note: Requires userId and token from authenticated request for RLS
 * @throws {Error} If token is required but not provided (RLS will block without token)
 */
export async function getAllProjects(userId: string, token: string): Promise<Project[]> {
  // Token is required for RLS authentication - validate and use
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: projects, error } = await client
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get projects: ${error.message}`);
  }

  if (!projects || projects.length === 0) {
    return [];
  }

  // Load chapters and glossary for each project
  // Note: This could be optimized with a single query using JOINs if needed
  const projectsWithRelations = await Promise.all(
    projects.map(async (project) => {
      const [chapters, glossary] = await Promise.all([
        loadChaptersForProject(project.id, token),
        loadGlossaryForProject(project.id, token),
      ]);
      return transformProjectFromDB(project, chapters, glossary);
    })
  );

  return projectsWithRelations;
}

/**
 * Get a single project by ID (with lightweight chapter list, no paragraphs/text)
 */
export async function getProject(
  id: string,
  userId: string,
  token: string
): Promise<ProjectWithChapterList | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: project, error } = await client
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return undefined;
    }
    throw new Error(`Failed to get project: ${error.message}`);
  }

  if (!project) {
    return undefined;
  }

  // Reset stuck chapters
  await resetStuckChapters(token, id);

  // Load lightweight chapters and glossary (no paragraphs, no text)
  const [chapters, glossary] = await Promise.all([
    loadChaptersForProjectLightweight(project.id, token),
    loadGlossaryForProject(project.id, token),
  ]);

  return transformProjectFromDBWithChapterList(project, chapters, glossary);
}

/**
 * Get project with full chapters (for export, etc.)
 */
export async function getProjectFull(
  id: string,
  userId: string,
  token: string
): Promise<Project | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: project, error } = await client
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !project) return undefined;

  const [chapters, glossary] = await Promise.all([
    loadChaptersForProject(project.id, token),
    loadGlossaryForProject(project.id, token),
  ]);

  return transformProjectFromDB(project, chapters, glossary);
}

/**
 * Verify user has access to a chapter (project belongs to user).
 * Uses a single join query instead of loading full project.
 */
export async function verifyChapterAccess(
  projectId: string,
  chapterId: string,
  userId: string,
  token: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('chapters')
    .select('id, projects!inner(user_id)')
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .eq('projects.user_id', userId)
    .single();

  return !error && !!data;
}

/**
 * Get chapters summary for a project (for ProcessChapters - no full text loaded).
 */
export async function getChaptersSummary(
  projectId: string,
  userId: string,
  token: string
): Promise<ChapterSummary[]> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: project } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (!project) {
    return [];
  }

  const { data: chapters, error } = await client
    .from('chapters')
    .select('id, number, title, status, translation_meta')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) throw new Error(`Failed to get chapters: ${error.message}`);
  if (!chapters || chapters.length === 0) return [];

  const chapterIds = chapters.map((c) => c.id);

  const [paragraphRows, translatedParagraphRows] = await Promise.all([
    client.from('paragraphs').select('chapter_id').in('chapter_id', chapterIds),
    client
      .from('paragraphs')
      .select('chapter_id')
      .in('chapter_id', chapterIds)
      .not('translated_text', 'is', null),
  ]);

  const paragraphCounts: Record<string, number> = {};
  for (const row of paragraphRows.data || []) {
    const cid = row.chapter_id as string;
    paragraphCounts[cid] = (paragraphCounts[cid] ?? 0) + 1;
  }

  const translatedCounts: Record<string, number> = {};
  for (const row of translatedParagraphRows.data || []) {
    const cid = row.chapter_id as string;
    translatedCounts[cid] = (translatedCounts[cid] ?? 0) + 1;
  }

  return chapters.map((ch) => {
    const meta = ch.translation_meta as Chapter['translationMeta'] | undefined;
    const paragraphCount = paragraphCounts[ch.id] ?? 0;
    const translatedParagraphCount = translatedCounts[ch.id] ?? 0;
    const hasTranslation =
      ch.status === 'completed' ||
      (ch.status === 'draft' && translatedParagraphCount > 0) ||
      (translatedParagraphCount > 0 && ch.status !== 'error');
    return {
      id: ch.id,
      number: ch.number,
      title: ch.title,
      status: ch.status as ChapterStatus,
      hasTranslation,
      hasOriginalText: paragraphCount > 0,
      paragraphCount,
      translatedParagraphCount,
      lastAnalysisAt: meta?.lastAnalysisAt,
    };
  });
}

/**
 * Create a new project
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function createProject(
  data: {
    name: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  },
  userId: string,
  token: string
): Promise<Project> {
  validateToken(token);
  const client = createClientWithToken(token);

  const projectData = {
    user_id: userId,
    name: data.name || 'Новый проект',
    type: 'text', // Default type, will be updated when first file is uploaded
    source_language: data.sourceLanguage || 'en',
    target_language: data.targetLanguage || 'ru',
    settings: getDefaultProjectSettings(),
  };

  const { data: project, error } = await client
    .from('projects')
    .insert(projectData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  logger.info(
    { event: 'project.created', projectId: project.id, projectName: project.name },
    `Project created: ${project.name} (${project.id})`
  );

  // Return transformed project with empty chapters and glossary
  return transformProjectFromDB(project, [], []);
}

/**
 * Update a project
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function updateProject(
  id: string,
  updates: Partial<Project>,
  userId: string,
  token: string
): Promise<ProjectWithChapterList | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const projectData = transformProjectToDB(updates);

  const { error } = await client
    .from('projects')
    .update(projectData)
    .eq('id', id)
    .eq('user_id', userId) // Ensure user owns the project
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update project: ${error.message}`);
  }

  // Reload full project with relations
  return getProject(id, userId, token);
}

/**
 * Delete a project
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function deleteProject(id: string, userId: string, token: string): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client.from('projects').delete().eq('id', id).eq('user_id', userId); // Ensure user owns the project

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`);
  }

  return true;
}

/**
 * Update reader settings for a project
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function updateReaderSettings(
  projectId: string,
  updates: Partial<ReaderSettings>,
  userId: string,
  token: string
): Promise<ReaderSettings | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // First get current project
  const project = await getProject(projectId, userId, token);
  if (!project) {
    return undefined;
  }

  // Merge reader settings (getReaderSettings handles legacy migration)
  const current = getReaderSettingsFromStorage(project);
  const merged: ReaderSettings = { ...current, ...updates };
  merged.fontSize = Math.max(14, Math.min(24, merged.fontSize));
  merged.lineHeight = Math.max(1.4, Math.min(2.0, merged.lineHeight));
  merged.paragraphSpacing = Math.max(0, Math.min(2, merged.paragraphSpacing));
  merged.containerWidth = Math.max(50, Math.min(100, merged.containerWidth));
  const updatedReaderSettings = merged;

  // Update project settings
  const updatedSettings = {
    ...project.settings,
    reader: updatedReaderSettings,
  };

  const { error } = await client
    .from('projects')
    .update({ settings: updatedSettings })
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update reader settings: ${error.message}`);
  }

  return updatedReaderSettings;
}

/**
 * Get reader settings from project (with defaults and legacy migration)
 */
export function getReaderSettings(project: Project | ProjectWithChapterList): ReaderSettings {
  return getReaderSettingsFromStorage(project as Project);
}

/**
 * Get user's saved reader settings (for registered users).
 * Returns null if no settings saved or on error.
 */
export async function getUserReaderSettings(
  userId: string,
  token: string
): Promise<ReaderSettings | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('user_reader_settings')
    .select('settings')
    .eq('user_id', userId)
    .single();

  if (error || !data?.settings) {
    return null;
  }

  const s = data.settings as Record<string, unknown>;
  if (typeof s !== 'object' || s === null) return null;

  let fontFamily =
    (s.fontFamily as ReaderSettings['fontFamily']) ?? DEFAULT_READER_SETTINGS.fontFamily;
  const legacyMapped = LEGACY_FONT_MAP[fontFamily as string];
  if (legacyMapped) fontFamily = legacyMapped;

  let paragraphSpacing =
    s.paragraphSpacing != null
      ? Number(s.paragraphSpacing)
      : DEFAULT_READER_SETTINGS.paragraphSpacing;
  if (paragraphSpacing > 2) paragraphSpacing = Math.min(2, paragraphSpacing / 16);

  return {
    ...DEFAULT_READER_SETTINGS,
    fontFamily,
    fontSize: Math.max(14, Math.min(24, Number(s.fontSize) || DEFAULT_READER_SETTINGS.fontSize)),
    lineHeight: Math.max(
      1.4,
      Math.min(2.0, Number(s.lineHeight) || DEFAULT_READER_SETTINGS.lineHeight)
    ),
    colorScheme:
      (s.colorScheme as ReaderSettings['colorScheme']) ?? DEFAULT_READER_SETTINGS.colorScheme,
    textIndent:
      s.textIndent !== undefined ? Boolean(s.textIndent) : DEFAULT_READER_SETTINGS.textIndent,
    textAlign: (s.textAlign as ReaderSettings['textAlign']) ?? DEFAULT_READER_SETTINGS.textAlign,
    hideChapterHeader:
      s.hideChapterHeader !== undefined
        ? Boolean(s.hideChapterHeader)
        : DEFAULT_READER_SETTINGS.hideChapterHeader,
    paragraphSpacing: Math.max(0, Math.min(2, paragraphSpacing)),
    containerWidth: Math.max(
      50,
      Math.min(100, Number(s.containerWidth) || DEFAULT_READER_SETTINGS.containerWidth)
    ),
    customBg: typeof s.customBg === 'string' ? s.customBg : undefined,
    customText: typeof s.customText === 'string' ? s.customText : undefined,
  };
}

/**
 * Update user's reader settings (for registered users).
 */
export async function updateUserReaderSettings(
  userId: string,
  updates: Partial<ReaderSettings>,
  token: string
): Promise<ReaderSettings> {
  validateToken(token);
  const client = createClientWithToken(token);

  const existing = await getUserReaderSettings(userId, token);
  const merged: ReaderSettings = {
    ...DEFAULT_READER_SETTINGS,
    ...existing,
    ...updates,
  };
  // Clamp values
  merged.fontSize = Math.max(14, Math.min(24, merged.fontSize));
  merged.lineHeight = Math.max(1.4, Math.min(2.0, merged.lineHeight));
  merged.paragraphSpacing = Math.max(
    0,
    Math.min(2, merged.paragraphSpacing ?? DEFAULT_READER_SETTINGS.paragraphSpacing)
  );
  merged.containerWidth = Math.max(
    50,
    Math.min(100, merged.containerWidth ?? DEFAULT_READER_SETTINGS.containerWidth)
  );

  const { error } = await client.from('user_reader_settings').upsert(
    {
      user_id: userId,
      settings: {
        fontFamily: merged.fontFamily,
        fontSize: merged.fontSize,
        lineHeight: merged.lineHeight,
        colorScheme: merged.colorScheme,
        textIndent: merged.textIndent,
        textAlign: merged.textAlign,
        hideChapterHeader: merged.hideChapterHeader,
        paragraphSpacing: merged.paragraphSpacing,
        containerWidth: merged.containerWidth,
        customBg: merged.customBg,
        customText: merged.customText,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`Failed to update user reader settings: ${error.message}`);
  }

  return merged;
}

/**
 * Reset stuck chapters (translating status for too long)
 * Note: Token is required if projectId is provided (for RLS)
 */
export async function resetStuckChapters(token: string, projectId?: string): Promise<number> {
  // If projectId is provided, token is required for RLS
  // Otherwise, can run without token (but will be limited by RLS)
  const client = token ? createClientWithToken(token) : supabase;
  const STUCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Build query to find stuck chapters
  let query = client
    .from('chapters')
    .select('id, project_id, status, translation_meta, updated_at')
    .eq('status', 'translating');

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data: chapters, error } = await query;

  if (error) {
    throw new Error(`Failed to get stuck chapters: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return 0;
  }

  const now = Date.now();
  let resetCount = 0;
  const chaptersToReset: string[] = [];

  for (const chapter of chapters) {
    let isStuck = false;

    // Check if translationMeta exists with translatedAt
    if (chapter.translation_meta?.translatedAt) {
      const translatedAt = new Date(chapter.translation_meta.translatedAt).getTime();
      isStuck = now - translatedAt > STUCK_TIMEOUT;
    } else {
      // Check updated_at timestamp
      const updatedAt = new Date(chapter.updated_at).getTime();
      isStuck = now - updatedAt > STUCK_TIMEOUT;
    }

    if (isStuck) {
      chaptersToReset.push(chapter.id);
      resetCount++;
    }
  }

  // Update stuck chapters
  if (chaptersToReset.length > 0) {
    const { error: updateError } = await client
      .from('chapters')
      .update({ status: 'pending' })
      .in('id', chaptersToReset);

    if (updateError) {
      throw new Error(`Failed to reset stuck chapters: ${updateError.message}`);
    }
  }

  return resetCount;
}

// ============================================
// Helper Functions to Load Related Data
// ============================================

/**
 * Load lightweight chapter list for a project (no paragraphs, no text).
 */
async function loadChaptersForProjectLightweight(
  projectId: string,
  token: string
): Promise<ChapterListItem[]> {
  const client = createClientWithToken(token);

  const { data: chapters, error } = await client
    .from('chapters')
    .select('id, number, title, status, translation_meta, created_at, updated_at')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load chapters: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return [];
  }

  return chapters.map((ch) => {
    const meta = ch.translation_meta as Chapter['translationMeta'] | undefined;
    const hasTranslation = ch.status === 'completed' || ch.status === 'draft';
    return {
      id: ch.id,
      number: ch.number,
      title: ch.title,
      status: ch.status as ChapterStatus,
      hasTranslation,
      translationMeta: meta,
    };
  });
}

/**
 * Load all chapters for a project (with paragraphs).
 * Uses nested select to fetch chapters + paragraphs in one query (avoids N+1).
 */
async function loadChaptersForProject(projectId: string, token: string): Promise<Chapter[]> {
  const client = createClientWithToken(token);

  const { data: chapters, error } = await client
    .from('chapters')
    .select('*, paragraphs(*)')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load chapters: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return [];
  }

  // Log loaded chapters order for debugging (only in development)
  if (process.env.NODE_ENV === 'development' && chapters.length <= 5) {
    logger.debug(
      { projectId, chaptersCount: chapters.length },
      `Chapters loaded: ${chapters.map((c) => `${c.number}: ${c.id.substring(0, 8)} (${c.title})`).join(', ')}`
    );
  }

  // Extract and transform paragraphs from nested response (one query instead of N)
  const chaptersWithParagraphs = await Promise.all(
    chapters.map(async (chapter) => {
      const rawParagraphs = (chapter.paragraphs ?? []) as Record<string, unknown>[];
      const paragraphs = rawParagraphs
        .sort((a, b) => ((a.index as number) ?? 0) - ((b.index as number) ?? 0))
        .map(transformParagraphFromDB);
      let paragraphsList = paragraphs;
      const chapterData = transformChapterFromDB(chapter, paragraphsList);

      // Auto-sync check: if chapter has translation but paragraphs are empty, restore sync
      const hasTranslation =
        (chapterData.translatedChunks && chapterData.translatedChunks.length > 0) ||
        (chapterData.translatedText && chapterData.translatedText.trim().length > 0);

      const hasEmptyParagraphs =
        paragraphsList.length > 0 &&
        !paragraphsList.some(
          (p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0
        );

      if (
        hasTranslation &&
        hasEmptyParagraphs &&
        chapterData.translatedChunks &&
        chapterData.translatedChunks.length > 0
      ) {
        // Auto-recovery: sync translatedChunks to paragraphs
        logger.info(
          { chapterId: chapter.id, chapterTitle: chapterData.title },
          `Auto-recovery: syncing paragraphs for chapter ${chapterData.title}`
        );

        const syncedParagraphs = autoSyncChunksToParagraphs(
          paragraphsList,
          chapterData.translatedChunks
        );

        if (
          syncedParagraphs.some(
            (p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0
          )
        ) {
          // Update paragraphs in database (batched)
          const BATCH_SIZE = 15;
          for (let i = 0; i < syncedParagraphs.length; i += BATCH_SIZE) {
            const batch = syncedParagraphs.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(async (paragraph: Paragraph) => {
                const paragraphData: Record<string, unknown> = {};
                if (paragraph.translatedText !== undefined)
                  paragraphData.translated_text = paragraph.translatedText || null;
                if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
                if (paragraph.editedAt !== undefined)
                  paragraphData.edited_at = paragraph.editedAt || null;
                if (paragraph.editedBy !== undefined)
                  paragraphData.edited_by = paragraph.editedBy || null;

                const { error } = await client
                  .from('paragraphs')
                  .update(paragraphData)
                  .eq('id', paragraph.id)
                  .eq('chapter_id', chapter.id);
                if (error)
                  logger.warn(
                    { paragraphId: paragraph.id, error: error.message },
                    'loadChapters auto-recovery: failed paragraph update'
                  );
              })
            );
            if (i + BATCH_SIZE < syncedParagraphs.length) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }

          // Reload updated paragraphs
          paragraphsList = await loadParagraphsForChapter(chapter.id, token);

          const syncedCount = paragraphsList.filter(
            (p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0
          ).length;
          logger.info(
            {
              chapterId: chapter.id,
              syncedCount,
              chunksCount: chapterData.translatedChunks.length,
            },
            `Auto-recovery: restored ${syncedCount} paragraphs from ${chapterData.translatedChunks.length} chunks`
          );
        }
      }

      return transformChapterFromDB(chapter, paragraphsList);
    })
  );

  return chaptersWithParagraphs;
}

/**
 * Load all chapters for a project using service role (no auth).
 * Used for publication export where project is loaded by publication.projectId.
 */
async function loadChaptersForProjectWithServiceRole(projectId: string): Promise<Chapter[]> {
  const { createServiceRoleClient } = await import('./supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: chapters, error } = await client
    .from('chapters')
    .select('*, paragraphs(*)')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load chapters: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return [];
  }

  return chapters.map((chapter) => {
    const rawParagraphs = (chapter.paragraphs ?? []) as Record<string, unknown>[];
    const paragraphs = rawParagraphs
      .sort((a, b) => ((a.index as number) ?? 0) - ((b.index as number) ?? 0))
      .map(transformParagraphFromDB);
    return transformChapterFromDB(chapter, paragraphs);
  });
}

/**
 * Get project with full chapters for publication export.
 * Uses service role (no user auth) - call only when publication is verified published.
 */
export async function getProjectForPublicationExport(projectId: string): Promise<Project | null> {
  try {
    const { createServiceRoleClient } = await import('./supabaseClient.js');
    const client = createServiceRoleClient();

    const { data: project, error } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return null;
    }

    const [chapters, glossary] = await Promise.all([
      loadChaptersForProjectWithServiceRole(projectId),
      loadGlossaryForProjectPublic(projectId),
    ]);

    return transformProjectFromDB(project, chapters, glossary);
  } catch (err) {
    logger.warn({ err, projectId }, 'getProjectForPublicationExport failed');
    return null;
  }
}

/**
 * Load all paragraphs for a chapter.
 * When useServiceRole is true, uses service role client (for long-running server flows where JWT may expire).
 */
async function loadParagraphsForChapter(
  chapterId: string,
  token: string | null,
  useServiceRole?: boolean
): Promise<Paragraph[]> {
  const client = useServiceRole
    ? (await import('./supabaseClient.js')).createServiceRoleClient()
    : token
      ? createClientWithToken(token)
      : supabase;

  const { data: paragraphs, error } = await client
    .from('paragraphs')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('index', { ascending: true });

  if (error) {
    throw new Error(`Failed to load paragraphs: ${error.message}`);
  }

  if (!paragraphs || paragraphs.length === 0) {
    return [];
  }

  return paragraphs.map(transformParagraphFromDB);
}

/**
 * Load all glossary entries for a project
 */
async function loadGlossaryForProject(projectId: string, token: string): Promise<GlossaryEntry[]> {
  const client = token ? createClientWithToken(token) : supabase;

  const { data: entries, error } = await client
    .from('glossary_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load glossary: ${error.message}`);
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  return entries.map(transformGlossaryEntryFromDB);
}

/**
 * Get a single glossary entry by id (for merging chapter appearance).
 */
export async function getGlossaryEntry(
  projectId: string,
  entryId: string,
  token: string
): Promise<GlossaryEntry | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: row, error } = await client
    .from('glossary_entries')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', entryId)
    .single();

  if (error || !row) {
    return null;
  }

  return transformGlossaryEntryFromDB(row);
}

/**
 * Load glossary entries for a project using service role (for public publication viewer).
 * Use only when publication is published; RLS blocks anon/user from reading project glossary.
 */
export async function loadGlossaryForProjectPublic(projectId: string): Promise<GlossaryEntry[]> {
  const { createServiceRoleClient } = await import('./supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: entries, error } = await client
    .from('glossary_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load glossary: ${error.message}`);
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  return entries.map(transformGlossaryEntryFromDB);
}

/**
 * Get glossary entry count for a project (service role). Used for publication API to show/hide Glossary button.
 */
export async function getGlossaryCountForProject(projectId: string): Promise<number> {
  const { createServiceRoleClient } = await import('./supabaseClient.js');
  const client = createServiceRoleClient();

  const { count, error } = await client
    .from('glossary_entries')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (error) {
    return 0;
  }
  return count ?? 0;
}

/**
 * Get glossary for a published publication (public, no auth). Returns empty array if publication not found or not published.
 */
export async function getGlossaryForPublication(publicationId: string): Promise<GlossaryEntry[]> {
  const pub = await getPublicationById(publicationId);
  if (!pub) return [];
  return loadGlossaryForProjectPublic(pub.projectId);
}

// ============================================
// Chapter Operations
// ============================================

/**
 * Add a new chapter to a project
 */
export async function addChapter(
  projectId: string,
  data: { title: string; originalText: string },
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Verify project exists (RLS will ensure user has access)
  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return undefined;
  }

  // Get next chapter number
  const { data: maxChapter } = await client
    .from('chapters')
    .select('number')
    .eq('project_id', projectId)
    .order('number', { ascending: false })
    .limit(1)
    .single();

  const nextNumber = maxChapter ? maxChapter.number + 1 : 1;

  // Parse text into paragraphs
  const paragraphs = parseTextToParagraphs(data.originalText);

  // Create chapter
  const chapterData = {
    project_id: projectId,
    number: nextNumber,
    title: data.title,
    original_text: data.originalText,
    status: 'pending' as const,
  };

  const { data: chapter, error } = await client
    .from('chapters')
    .insert(chapterData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create chapter: ${error.message}`);
  }

  // Create paragraphs for the chapter
  if (paragraphs.length > 0) {
    const paragraphData = paragraphs.map((p) => ({
      chapter_id: chapter.id,
      index: p.index,
      original_text: p.originalText,
      status: p.status,
    }));

    const { error: paraError } = await client.from('paragraphs').insert(paragraphData);

    if (paraError) {
      // Cleanup: delete chapter if paragraphs insert failed
      await client.from('chapters').delete().eq('id', chapter.id);
      throw new Error(`Failed to create paragraphs: ${paraError.message}`);
    }
  }

  // Update project updated_at timestamp
  await client.from('projects').update({}).eq('id', projectId);

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

  // Reload chapter with paragraphs
  const paragraphsList = await loadParagraphsForChapter(chapter.id, token);
  return transformChapterFromDB(chapter, paragraphsList);
}

/** Options for updateChapter when using service role (e.g. long-running translate where JWT may expire). */
export type UpdateChapterOptions = { useServiceRole?: boolean };

/**
 * Update a chapter.
 * When options.useServiceRole is true, uses service role client so DB calls succeed even if user JWT expired.
 */
export async function updateChapter(
  projectId: string,
  chapterId: string,
  updates: Partial<Chapter>,
  token: string,
  options?: UpdateChapterOptions
): Promise<Chapter | undefined> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('./supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  // Verify chapter belongs to project (RLS will check user ownership)
  const chapterData = transformChapterToDB(updates);

  const { data: chapter, error } = await client
    .from('chapters')
    .update(chapterData)
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update chapter: ${error.message}`);
  }

  // Update paragraphs if provided (batched to avoid connection exhaustion)
  if (updates.paragraphs && Array.isArray(updates.paragraphs)) {
    const BATCH_SIZE = 15;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < updates.paragraphs.length; i += BATCH_SIZE) {
      const batch = updates.paragraphs.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (paragraph) => {
          const paragraphData: Record<string, unknown> = {};
          if (paragraph.translatedText !== undefined)
            paragraphData.translated_text = paragraph.translatedText || null;
          if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
          if (paragraph.editedAt !== undefined)
            paragraphData.edited_at = paragraph.editedAt || null;
          if (paragraph.editedBy !== undefined)
            paragraphData.edited_by = paragraph.editedBy || null;

          const { error } = await client
            .from('paragraphs')
            .update(paragraphData)
            .eq('id', paragraph.id)
            .eq('chapter_id', chapterId);

          return { id: paragraph.id, error };
        })
      );

      results.forEach((r) => (r.error ? failCount++ : successCount++));
      if (i + BATCH_SIZE < updates.paragraphs.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    logger.info(
      {
        event: 'paragraphs.updated',
        chapterId,
        successCount,
        failCount,
        total: updates.paragraphs.length,
      },
      `Paragraphs updated: ${successCount} ok, ${failCount} errors, ${updates.paragraphs.length} total`
    );
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  // Reload with paragraphs (will load updated paragraphs from DB)
  const paragraphs = await loadParagraphsForChapter(
    chapter.id,
    useServiceRole ? null : token,
    useServiceRole
  );
  const withTranslation = paragraphs.filter(
    (p) => p.translatedText && p.translatedText.trim().length > 0
  ).length;
  if (
    updates.paragraphs &&
    updates.paragraphs.length > 0 &&
    withTranslation !== updates.paragraphs.length
  ) {
    logger.debug(
      {
        chapterId,
        paragraphsLength: paragraphs.length,
        withTranslation,
        expected: updates.paragraphs.length,
      },
      'updateChapter: after reload, translation count mismatch'
    );
  }
  return transformChapterFromDB(chapter, paragraphs);
}

/**
 * Auto-sync translated chunks to paragraphs (helper for recovery)
 * Simplified version for use in getChapter auto-recovery
 */
function autoSyncChunksToParagraphs(
  originalParagraphs: Paragraph[],
  translatedChunks: string[]
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    return [];
  }

  if (!translatedChunks || translatedChunks.length === 0) {
    return originalParagraphs;
  }

  const now = new Date().toISOString();

  // Helper to check if paragraph is a separator
  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  // Helper to check if paragraph has valid translation
  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    if (text.startsWith('❌') || text.startsWith('[ERROR')) return false;
    return true;
  };

  let translationIndex = 0;

  return originalParagraphs.map((original) => {
    // Skip separator paragraphs
    if (isSeparatorParagraph(original)) {
      return original;
    }

    // Preserve existing valid translations
    if (hasValidTranslation(original)) {
      return original;
    }

    // Get next available translation
    if (translationIndex < translatedChunks.length) {
      const translatedChunk = translatedChunks[translationIndex];
      translationIndex++;

      if (translatedChunk && translatedChunk.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedChunk,
          status: 'translated' as const,
          editedAt: now,
          editedBy: 'ai' as const,
        };
      }
    }

    return original;
  });
}

/** Options for getChapter when using service role (e.g. long-running translate where JWT may expire). */
export type GetChapterOptions = { useServiceRole?: boolean };

/**
 * Get a single chapter.
 * When options.useServiceRole is true, uses service role client so DB calls succeed even if user JWT expired.
 */
export async function getChapter(
  projectId: string,
  chapterId: string,
  token: string,
  options?: GetChapterOptions
): Promise<Chapter | undefined> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('./supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  const { data: chapter, error } = await client
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to get chapter: ${error.message}`);
  }

  if (!chapter) {
    return undefined;
  }

  // Load paragraphs
  let paragraphs = await loadParagraphsForChapter(
    chapter.id,
    useServiceRole ? null : token,
    useServiceRole
  );
  const chapterData = transformChapterFromDB(chapter, paragraphs);

  // Auto-sync check: if chapter has translation but paragraphs are empty, restore sync
  const hasTranslation =
    (chapterData.translatedChunks && chapterData.translatedChunks.length > 0) ||
    (chapterData.translatedText && chapterData.translatedText.trim().length > 0);

  const hasEmptyParagraphs =
    paragraphs.length > 0 &&
    !paragraphs.some((p) => p.translatedText && p.translatedText.trim().length > 0);

  if (
    hasTranslation &&
    hasEmptyParagraphs &&
    chapterData.translatedChunks &&
    chapterData.translatedChunks.length > 0
  ) {
    // Auto-recovery: sync translatedChunks to paragraphs
    logger.info(
      { chapterId, chapterTitle: chapterData.title },
      `Auto-recovery: syncing paragraphs for chapter ${chapterData.title}`
    );

    const syncedParagraphs = autoSyncChunksToParagraphs(paragraphs, chapterData.translatedChunks);

    if (
      syncedParagraphs.some(
        (p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0
      )
    ) {
      const BATCH_SIZE = 15;
      for (let i = 0; i < syncedParagraphs.length; i += BATCH_SIZE) {
        const batch = syncedParagraphs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (paragraph: Paragraph) => {
            const paragraphData: Record<string, unknown> = {};
            if (paragraph.translatedText !== undefined)
              paragraphData.translated_text = paragraph.translatedText || null;
            if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
            if (paragraph.editedAt !== undefined)
              paragraphData.edited_at = paragraph.editedAt || null;
            if (paragraph.editedBy !== undefined)
              paragraphData.edited_by = paragraph.editedBy || null;

            const { error } = await client
              .from('paragraphs')
              .update(paragraphData)
              .eq('id', paragraph.id)
              .eq('chapter_id', chapterId);
            return { id: paragraph.id, error };
          })
        );
        results.forEach((r) => {
          if (r.error)
            logger.warn(
              { paragraphId: r.id, error: r.error?.message },
              'auto-recovery: failed paragraph update'
            );
        });
        if (i + BATCH_SIZE < syncedParagraphs.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Reload updated paragraphs
      paragraphs = await loadParagraphsForChapter(
        chapter.id,
        useServiceRole ? null : token,
        useServiceRole
      );

      const syncedCount = paragraphs.filter(
        (p) => p.translatedText && p.translatedText.trim().length > 0
      ).length;
      logger.info(
        { chapterId, syncedCount, chunksCount: chapterData.translatedChunks.length },
        `Auto-recovery: restored ${syncedCount} paragraphs from ${chapterData.translatedChunks.length} chunks`
      );
    }
  }

  return transformChapterFromDB(chapter, paragraphs);
}

/**
 * Delete a chapter
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function deleteChapter(
  projectId: string,
  chapterId: string,
  token: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  // First get chapter to get title for logging
  const chapter = await getChapter(projectId, chapterId, token);
  if (!chapter) {
    return false;
  }

  // Delete chapter (paragraphs will be deleted automatically via CASCADE)
  const { error } = await client
    .from('chapters')
    .delete()
    .eq('id', chapterId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to delete chapter: ${error.message}`);
  }

  // Renumber remaining chapters
  await renumberChapters(projectId, token);

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  logger.info(
    { event: 'chapter.deleted', chapterId, chapterTitle: chapter.title },
    `Chapter deleted: ${chapter.title}`
  );

  return true;
}

/**
 * Update chapter number and renumber other chapters
 */
export async function updateChapterNumber(
  projectId: string,
  chapterId: string,
  newNumber: number,
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Get all chapters for the project
  const { data: chapters, error: chaptersError } = await client
    .from('chapters')
    .select('id, number')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (chaptersError) {
    throw new Error(`Failed to get chapters: ${chaptersError.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return undefined;
  }

  const chapterToUpdate = chapters.find((c) => c.id === chapterId);
  if (!chapterToUpdate) {
    return undefined;
  }

  const oldNumber = chapterToUpdate.number;
  const maxNumber = chapters.length;

  // Validate new number
  if (newNumber < 1 || newNumber > maxNumber) {
    throw new Error(`Номер главы должен быть от 1 до ${maxNumber}`);
  }

  if (newNumber === oldNumber) {
    // No change needed, return current chapter
    return getChapter(projectId, chapterId, token);
  }

  // Reorder chapters
  const sortedChapters = [...chapters];
  const chapterIndex = sortedChapters.findIndex((c) => c.id === chapterId);
  logger.debug(
    {
      projectId,
      chapterId,
      sortedOrder: sortedChapters.map((c) => `${c.number}: ${c.id.substring(0, 8)}`).join(', '),
    },
    'Reorder: initial order'
  );
  logger.debug(
    { projectId, chapterId, oldNumber, chapterIndex, newNumber },
    `Reorder: moving chapter ${chapterId.substring(0, 8)} from ${oldNumber} to ${newNumber}`
  );

  const [movedChapter] = sortedChapters.splice(chapterIndex, 1);
  logger.debug(
    {
      projectId,
      afterDelete: sortedChapters.map((c) => `${c.number}: ${c.id.substring(0, 8)}`).join(', '),
    },
    'Reorder: after remove'
  );

  // Calculate insertion index accounting for the removed chapter
  // newNumber is the desired final position (1-based) AFTER reordering
  //
  // Example: [1,2] move chapter 2 to position 1 (newNumber=1)
  // - Remove chapter 2: [1]
  // - We want chapter 2 to be first (position 1), so insert at index 0
  // - insertIndex = newNumber - 1 = 0 ✓
  // - Insert: [2, 1]
  // - Renumber: chapter 2 gets number 1, chapter 1 gets number 2
  // - Final order: [2 (number 1), 1 (number 2)] ✓
  //
  // Example: [1,2,3,4,5], move chapter 2 (index 1) to position 4 (newNumber=4)
  // - Remove chapter 2: [1,3,4,5]
  // - We want chapter 2 at position 4, so insert at index 3
  // - insertIndex = newNumber - 1 = 3 ✓
  // - Insert: [1,3,4,2,5]
  // - Renumber: [1,2,3,4,5] where positions are [1,3,4,2,5] ✓
  //
  // The key: newNumber is the FINAL position (1-based) after reordering
  // We insert at newNumber - 1 (0-based index in array after removal)
  const insertIndex = newNumber - 1;
  sortedChapters.splice(insertIndex, 0, movedChapter);
  logger.debug(
    {
      projectId,
      insertIndex,
      afterInsert: sortedChapters.map((c) => `${c.number}: ${c.id.substring(0, 8)}`).join(', '),
    },
    'Reorder: after insert'
  );

  const orderedIds = sortedChapters.map((c) => c.id);
  const hasChanges = orderedIds.some((id, i) => chapters[i]?.id !== id);
  if (!hasChanges) {
    return getChapter(projectId, chapterId, token);
  }

  await updateChaptersOrder(projectId, orderedIds, token);

  logger.info(
    { event: 'chapter.reordered', projectId, chapterId, oldNumber, newNumber, insertIndex },
    `Chapter number changed: ${chapterId.substring(0, 8)} ${oldNumber} → ${newNumber}`
  );

  return getChapter(projectId, chapterId, token);
}

// Simple per-project async lock queue to serialize reorder operations
const reorderLocks = new Map<string, Array<() => void>>();

async function acquireReorderLock(projectId: string) {
  return new Promise<void>((resolve) => {
    const q = reorderLocks.get(projectId) || [];
    q.push(resolve);
    reorderLocks.set(projectId, q);
    if (q.length === 1) {
      // no one before us
      resolve();
    }
  });
}

function releaseReorderLock(projectId: string) {
  const q = reorderLocks.get(projectId);
  if (!q) return;
  q.shift();
  if (q.length === 0) {
    reorderLocks.delete(projectId);
  } else {
    const next = q[0];
    next();
  }
}

/**
 * Update full chapters order using an array of ordered ids.
 * Uses PostgreSQL RPC for atomic transaction - no partial state on failure.
 */
export async function updateChaptersOrder(
  projectId: string,
  orderedIds: string[],
  token: string
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  await acquireReorderLock(projectId);
  try {
    // Load current chapters to validate
    const { data: chapters, error: chaptersError } = await client
      .from('chapters')
      .select('id')
      .eq('project_id', projectId)
      .order('number', { ascending: true });

    if (chaptersError) {
      throw new Error(`Failed to get chapters: ${chaptersError.message}`);
    }
    if (!chapters) return;

    const currentIds = chapters.map((c) => c.id);
    if (currentIds.length !== orderedIds.length) {
      throw new Error('Ordered ids length does not match current chapters count');
    }

    const setA = new Set(currentIds);
    const setB = new Set(orderedIds);
    if (setA.size !== setB.size || ![...setA].every((id) => setB.has(id))) {
      throw new Error('Ordered ids do not match current chapter ids');
    }

    const { error: rpcError } = await client.rpc('reorder_chapters', {
      p_project_id: projectId,
      p_ordered_ids: orderedIds,
    });

    if (rpcError) {
      logger.error({ projectId, err: rpcError }, 'reorder_chapters RPC failed');
      throw new Error(rpcError.message || 'Failed to reorder chapters');
    }
  } finally {
    releaseReorderLock(projectId);
  }
}

/**
 * Helper: Renumber chapters sequentially starting from 1 (atomic via RPC)
 */
async function renumberChapters(projectId: string, token: string): Promise<void> {
  const client = createClientWithToken(token);

  const { error } = await client.rpc('renumber_chapters_atomic', {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(`Failed to renumber chapters: ${error.message}`);
  }
}

// ============================================
// Glossary Operations
// ============================================

/**
 * Add a glossary entry to a project
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function addGlossaryEntry(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id'>,
  token: string
): Promise<GlossaryEntry | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Verify project exists (RLS will ensure user has access)
  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return undefined;
  }

  const entryData = {
    project_id: projectId,
    type: normalizeGlossaryTypeForDB(entry.type),
    original: entry.original,
    translated: entry.translated,
    gender: normalizeGenderForDB(entry.gender),
    declensions: entry.declensions || null,
    description: entry.description || null,
    notes: entry.notes || null,
    first_appearance: entry.firstAppearance || null,
    mentioned_in_chapters: entry.mentionedInChapters ?? null,
    image_urls: entry.imageUrls || [],
    auto_detected: entry.autoDetected || false,
  };

  const { data: newEntry, error } = await client
    .from('glossary_entries')
    .insert(entryData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformGlossaryEntryFromDB(newEntry);
}

/**
 * Update a glossary entry
 */
export async function updateGlossaryEntry(
  projectId: string,
  entryId: string,
  updates: Partial<GlossaryEntry>,
  token: string
): Promise<GlossaryEntry | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Get current entry to merge imageUrls if needed
  const { data: currentEntry } = await client
    .from('glossary_entries')
    .select('*')
    .eq('id', entryId)
    .eq('project_id', projectId)
    .single();

  if (!currentEntry) {
    return undefined;
  }

  // Handle imageUrls migration (legacy support)
  let imageUrls = updates.imageUrls || currentEntry.image_urls || [];
  if (updates.imageUrl && !imageUrls.includes(updates.imageUrl)) {
    imageUrls = [updates.imageUrl, ...imageUrls];
  }

  const entryData: Record<string, unknown> = {};
  if (updates.type !== undefined) entryData.type = normalizeGlossaryTypeForDB(updates.type);
  if (updates.original !== undefined) entryData.original = updates.original;
  if (updates.translated !== undefined) entryData.translated = updates.translated;
  if (updates.gender !== undefined) entryData.gender = normalizeGenderForDB(updates.gender);
  if (updates.declensions !== undefined) entryData.declensions = updates.declensions || null;
  if (updates.description !== undefined) entryData.description = updates.description || null;
  if (updates.notes !== undefined) entryData.notes = updates.notes || null;
  if (updates.firstAppearance !== undefined)
    entryData.first_appearance = updates.firstAppearance || null;
  if (updates.mentionedInChapters !== undefined)
    entryData.mentioned_in_chapters = updates.mentionedInChapters?.length
      ? updates.mentionedInChapters
      : null;
  if (imageUrls.length > 0 || updates.imageUrls !== undefined) entryData.image_urls = imageUrls;
  if (updates.autoDetected !== undefined) entryData.auto_detected = updates.autoDetected;

  const { data: updatedEntry, error } = await client
    .from('glossary_entries')
    .update(entryData)
    .eq('id', entryId)
    .eq('project_id', projectId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformGlossaryEntryFromDB(updatedEntry);
}

/**
 * Delete a glossary entry
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function deleteGlossaryEntry(
  projectId: string,
  entryId: string,
  token: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client
    .from('glossary_entries')
    .delete()
    .eq('id', entryId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to delete glossary entry: ${error.message}`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return true;
}

// ============================================
// Paragraph Operations
// ============================================

/**
 * Update a single paragraph
 */
export async function updateParagraph(
  projectId: string,
  chapterId: string,
  paragraphId: string,
  updates: Partial<Paragraph>,
  token: string
): Promise<Paragraph | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Verify chapter belongs to project (RLS will check access)
  const { data: chapter } = await client
    .from('chapters')
    .select('id')
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .single();

  if (!chapter) {
    return undefined;
  }

  // Build update data
  const paragraphData: Record<string, unknown> = {};
  if (updates.translatedText !== undefined)
    paragraphData.translated_text = updates.translatedText || null;
  if (updates.status !== undefined) paragraphData.status = updates.status;
  if (updates.editedAt !== undefined) paragraphData.edited_at = updates.editedAt || null;
  if (updates.editedBy !== undefined) paragraphData.edited_by = updates.editedBy || null;

  const { data: updatedParagraph, error } = await client
    .from('paragraphs')
    .update(paragraphData)
    .eq('id', paragraphId)
    .eq('chapter_id', chapterId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update paragraph: ${error.message}`);
  }

  // If translated text was updated, sync to chapter translatedText
  if (updates.translatedText !== undefined) {
    const fullChapter = await getChapter(projectId, chapterId, token);
    if (fullChapter && fullChapter.paragraphs) {
      const mergedText = mergeParagraphsToText(fullChapter.paragraphs);
      const chunks = mergedText
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);

      await client
        .from('chapters')
        .update({
          translated_text: mergedText || null,
          translated_chunks: chunks.length > 0 ? chunks : null,
        })
        .eq('id', chapterId);
    }
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformParagraphFromDB(updatedParagraph);
}

// ============================================
// Publication Types (catalog)
// ============================================

export type PublicationStatus = 'draft' | 'published' | 'unpublished';

export interface PublicationRow {
  id: string;
  project_id: string;
  user_id: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  author_display: string | null;
  translator_display: string | null;
  source_language: string;
  target_language: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
}

function transformPublicationFromDB(row: PublicationRow): {
  id: string;
  projectId: string;
  userId: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplay: string | null;
  translatorDisplay: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slug: string | null;
} {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    authorDisplay: row.author_display,
    translatorDisplay: (row as { translator_display?: string | null }).translator_display ?? null,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: (row as { slug?: string | null }).slug ?? null,
  };
}

/**
 * List published publications (public, no auth).
 * Uses anon client - RLS allows SELECT where status = 'published'.
 */
export async function listPublicationsPublic(options?: {
  limit?: number;
  offset?: number;
  orderBy?: 'published_at' | 'created_at';
  orderAsc?: boolean;
}): Promise<
  {
    id: string;
    projectId: string;
    status: PublicationStatus;
    title: string | null;
    description: string | null;
    coverImageUrl: string | null;
    authorDisplay: string | null;
    translatorDisplay: string | null;
    sourceLanguage: string;
    targetLanguage: string;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    slug: string | null;
  }[]
> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const orderBy = options?.orderBy ?? 'published_at';
  const orderAsc = options?.orderAsc ?? false;

  const { data, error } = await supabase
    .from('publications')
    .select('*')
    .eq('status', 'published')
    .order(orderBy === 'published_at' ? 'published_at' : 'created_at', {
      ascending: orderAsc,
      nullsFirst: false,
    })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list publications: ${error.message}`);
  }

  return (data || []).map((row: PublicationRow) => transformPublicationFromDB(row));
}

/**
 * Get publication by slug or ID (public for published).
 * Tries slug first (if looks like slug: no hyphens in UUID pattern), then ID.
 */
export async function getPublicationBySlugOrId(slugOrId: string): Promise<ReturnType<
  typeof transformPublicationFromDB
> | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  if (isUuid) {
    return getPublicationById(slugOrId);
  }
  const { data, error } = await supabase
    .from('publications')
    .select('*')
    .eq('slug', slugOrId)
    .eq('status', 'published')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get publication: ${error.message}`);
  }
  if (!data) return null;
  return transformPublicationFromDB(data as PublicationRow);
}

/**
 * Get a single publication by ID (public for published).
 * Uses anon client - RLS allows SELECT for published or own.
 */
export async function getPublicationById(publicationId: string): Promise<ReturnType<
  typeof transformPublicationFromDB
> | null> {
  const { data, error } = await supabase
    .from('publications')
    .select('*')
    .eq('id', publicationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get publication: ${error.message}`);
  }

  if (!data || (data as PublicationRow).status !== 'published') {
    return null;
  }

  return transformPublicationFromDB(data as PublicationRow);
}

/**
 * Get publication by slug or ID with chapters list (for reading page).
 * Returns only published; chapters are minimal (id, number, title, hasTranslation); glossaryCount for showing Glossary button.
 */
export async function getPublicationWithChapters(slugOrId: string): Promise<{
  publication: ReturnType<typeof transformPublicationFromDB>;
  chapters: Array<{ id: string; number: number; title: string; hasTranslation: boolean }>;
  glossaryCount: number;
} | null> {
  const pub = await getPublicationBySlugOrId(slugOrId);
  if (!pub) return null;

  // Load chapters for this project (we need token for RLS on chapters - but chapters are under project owned by publication owner)
  // Chapters are under project (private by RLS). Use service role to read chapters for published project.
  let chapters: { id: string; number: number; title: string; translated_text: string | null }[] =
    [];
  try {
    const { createServiceRoleClient } = await import('./supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data } = await serviceClient
      .from('chapters')
      .select('id, number, title, translated_text')
      .eq('project_id', pub.projectId)
      .order('number', { ascending: true });
    chapters = data || [];
  } catch {
    // Service role not configured: return publication without chapters (client can still show metadata)
  }

  const list = chapters.map((c) => ({
    id: c.id,
    number: c.number,
    title: c.title,
    hasTranslation: !!c.translated_text,
  }));

  let glossaryCount = 0;
  try {
    glossaryCount = await getGlossaryCountForProject(pub.projectId);
  } catch {
    // Service role or glossary table issue: return 0 so client hides Glossary button
  }

  return { publication: pub, chapters: list, glossaryCount };
}

/**
 * Get a single chapter's content for public reading (translated text only).
 * Publication must be published; chapter must belong to the publication's project.
 */
export async function getPublicationChapterContent(
  publicationId: string,
  chapterId: string
): Promise<{ id: string; number: number; title: string; translatedText: string } | null> {
  const pub = await getPublicationById(publicationId);
  if (!pub) return null;

  let chapter: {
    id: string;
    number: number;
    title: string;
    translated_text: string | null;
  } | null = null;
  try {
    const { createServiceRoleClient } = await import('./supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data, error } = await serviceClient
      .from('chapters')
      .select('id, number, title, translated_text')
      .eq('id', chapterId)
      .eq('project_id', pub.projectId)
      .single();
    if (error || !data) return null;
    chapter = data;
  } catch {
    return null;
  }

  if (!chapter || !chapter.translated_text) return null;
  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    translatedText: chapter.translated_text,
  };
}

/**
 * Create or update publication for a project (owner only).
 */
export async function createOrUpdatePublication(
  projectId: string,
  userId: string,
  token: string,
  data: {
    status: 'draft' | 'published';
    title?: string | null;
    description?: string | null;
    coverImageUrl?: string | null;
    authorDisplay?: string | null;
    translatorDisplay?: string | null;
    sourceLanguage?: string;
    targetLanguage?: string;
  }
): Promise<ReturnType<typeof transformPublicationFromDB>> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Ensure user owns the project
  const project = await getProject(projectId, userId, token);
  if (!project) {
    throw new Error('Project not found');
  }

  const now = new Date().toISOString();
  const isPublish = data.status === 'published';
  const title = data.title ?? project.metadata?.title ?? project.name;

  const { data: existing } = await client
    .from('publications')
    .select('id, published_at')
    .eq('project_id', projectId)
    .single();

  const slug = title ? await ensureUniqueSlug(client, titleToSlug(title), existing?.id ?? null) : null;

  const row = {
    project_id: projectId,
    user_id: userId,
    status: data.status,
    title,
    description: data.description ?? project.metadata?.description ?? null,
    cover_image_url: data.coverImageUrl ?? project.metadata?.coverImageUrl ?? null,
    author_display: data.authorDisplay ?? undefined,
    translator_display: data.translatorDisplay ?? undefined,
    source_language: data.sourceLanguage ?? project.sourceLanguage,
    target_language: data.targetLanguage ?? project.targetLanguage,
    published_at: isPublish ? now : null,
    updated_at: now,
    slug,
  };

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      status: data.status,
      title: row.title,
      description: row.description,
      cover_image_url: row.cover_image_url,
      source_language: row.source_language,
      target_language: row.target_language,
      updated_at: row.updated_at,
      slug: slug ?? undefined,
    };
    if (data.authorDisplay !== undefined) updatePayload.author_display = data.authorDisplay;
    if (data.translatorDisplay !== undefined)
      updatePayload.translator_display = data.translatorDisplay;
    // Only set published_at when first publishing (keep "first published" date on subsequent updates)
    if (isPublish && !(existing as { published_at?: string | null }).published_at) {
      updatePayload.published_at = row.published_at;
    }
    // When unpublishing we don't clear published_at (keep history)

    const { data: updated, error } = await client
      .from('publications')
      .update(updatePayload)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update publication: ${error.message}`);
    }
    return transformPublicationFromDB(updated as PublicationRow);
  }

  const insertPayload = {
    ...row,
    author_display: row.author_display ?? null,
    translator_display: row.translator_display ?? null,
  };

  const { data: inserted, error } = await client
    .from('publications')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create publication: ${error.message}`);
  }
  return transformPublicationFromDB(inserted as PublicationRow);
}

/**
 * Unpublish (set status to unpublished) or delete publication.
 */
export async function unpublishProject(
  projectId: string,
  userId: string,
  token: string
): Promise<boolean> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications')
    .update({ status: 'unpublished', updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return false;
    }
    throw new Error(`Failed to unpublish: ${error.message}`);
  }
  return !!data;
}

/**
 * Get all publications for current user (any status).
 */
export async function getUserPublications(
  userId: string,
  token: string
): Promise<ReturnType<typeof transformPublicationFromDB>[]> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get user publications: ${error.message}`);
  }
  return (data || []).map((row: PublicationRow) => transformPublicationFromDB(row));
}

/**
 * Get publication by project ID (for owner).
 */
export async function getPublicationByProjectId(
  projectId: string,
  userId: string,
  token: string
): Promise<ReturnType<typeof transformPublicationFromDB> | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`Failed to get publication: ${error.message}`);
    return null;
  }
  return transformPublicationFromDB(data as PublicationRow);
}

// ============================================
// User publication progress (read chapters + reading position)
// ============================================

export interface ReadProgressResult {
  chapterIds: string[];
  lastReadChapterId: string | null;
  lastReadParagraphIndex: number;
}

/**
 * Mark a chapter as read for a user in a publication.
 * Uses user token for RLS (user can only insert/update own records).
 */
export async function markChapterAsRead(
  userId: string,
  publicationId: string,
  chapterId: string,
  token: string
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: existing } = await client
    .from('user_publication_progress')
    .select('read_chapter_ids')
    .eq('user_id', userId)
    .eq('publication_id', publicationId)
    .maybeSingle();

  const existingIds = (existing?.read_chapter_ids as string[] | null) ?? [];
  const readChapterIds = existingIds.includes(chapterId)
    ? existingIds
    : [...existingIds, chapterId];

  const { error } = await client.from('user_publication_progress').upsert(
    {
      user_id: userId,
      publication_id: publicationId,
      read_chapter_ids: readChapterIds,
      last_read_chapter_id: chapterId,
      last_read_paragraph_index: 0,
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,publication_id',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw new Error(`Failed to mark chapter as read: ${error.message}`);
  }
}

/**
 * Get read progress for a publication: chapter IDs read + last reading position.
 * Returns empty result if userId or token is null (guest).
 */
export async function getReadProgress(
  publicationId: string,
  userId: string | null,
  token: string | null
): Promise<ReadProgressResult> {
  if (!userId || !token) {
    return { chapterIds: [], lastReadChapterId: null, lastReadParagraphIndex: 0 };
  }

  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('user_publication_progress')
    .select('read_chapter_ids, last_read_chapter_id, last_read_paragraph_index')
    .eq('publication_id', publicationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, publicationId, userId }, 'Failed to get read progress');
    return { chapterIds: [], lastReadChapterId: null, lastReadParagraphIndex: 0 };
  }

  const ids = (data?.read_chapter_ids as string[] | null) ?? [];
  return {
    chapterIds: ids,
    lastReadChapterId: (data?.last_read_chapter_id as string | null) ?? null,
    lastReadParagraphIndex: (data?.last_read_paragraph_index as number | null) ?? 0,
  };
}

/**
 * Update reading position (chapter + paragraph index).
 * Called when user opens a chapter or leaves (visibilitychange, beforeunload).
 */
export async function updateReadingPosition(
  userId: string,
  publicationId: string,
  chapterId: string,
  paragraphIndex: number,
  token: string
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: existing } = await client
    .from('user_publication_progress')
    .select('read_chapter_ids')
    .eq('user_id', userId)
    .eq('publication_id', publicationId)
    .maybeSingle();

  const readChapterIds = (existing?.read_chapter_ids as string[] | null) ?? [];

  const { error } = await client.from('user_publication_progress').upsert(
    {
      user_id: userId,
      publication_id: publicationId,
      read_chapter_ids: readChapterIds,
      last_read_chapter_id: chapterId,
      last_read_paragraph_index: Math.max(0, paragraphIndex),
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,publication_id',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw new Error(`Failed to update reading position: ${error.message}`);
  }
}

// ============================================
// User reading history (for cabinet)
// ============================================

export interface ReadingHistoryItem {
  publicationId: string;
  title: string | null;
  coverImageUrl: string | null;
  slug: string | null;
  totalChapters: number;
  readCount: number;
  lastReadChapterId: string | null;
  lastReadAt: string | null;
}

/**
 * Get user's reading history: publications they have progress on, with metadata.
 * Ordered by last_read_at DESC.
 */
export async function getUserReadingHistory(
  userId: string,
  token: string
): Promise<ReadingHistoryItem[]> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: progressRows, error } = await client
    .from('user_publication_progress')
    .select(
      `
      publication_id,
      read_chapter_ids,
      last_read_chapter_id,
      last_read_at,
      publications!inner (
        id,
        title,
        cover_image_url,
        slug,
        project_id,
        status
      )
    `
    )
    .eq('user_id', userId)
    .order('last_read_at', { ascending: false, nullsFirst: false });

  if (error) {
    logger.warn({ err: error, userId }, 'Failed to get reading history');
    return [];
  }

  if (!progressRows || progressRows.length === 0) {
    return [];
  }

  // Filter to published only, extract project_ids for chapter count
  const items: Array<{
    publicationId: string;
    title: string | null;
    coverImageUrl: string | null;
    slug: string | null;
    projectId: string;
    readCount: number;
    lastReadChapterId: string | null;
    lastReadAt: string | null;
  }> = [];

  for (const row of progressRows) {
    const pub = row.publications as unknown as {
      id: string;
      title: string | null;
      cover_image_url: string | null;
      slug: string | null;
      project_id: string;
      status: string;
    };
    if (pub?.status !== 'published') continue;

    const readIds = (row.read_chapter_ids as string[] | null) ?? [];
    items.push({
      publicationId: row.publication_id as string,
      title: pub.title ?? null,
      coverImageUrl: pub.cover_image_url ?? null,
      slug: pub.slug ?? null,
      projectId: pub.project_id,
      readCount: readIds.length,
      lastReadChapterId: (row.last_read_chapter_id as string | null) ?? null,
      lastReadAt: (row.last_read_at as string | null) ?? null,
    });
  }

  if (items.length === 0) return [];

  // Get chapter counts per project (service role for chapters)
  const projectIds = [...new Set(items.map((i) => i.projectId))];
  const chapterCountByProject: Record<string, number> = {};

  try {
    const { createServiceRoleClient } = await import('./supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapterCounts } = await serviceClient
      .from('chapters')
      .select('project_id')
      .in('project_id', projectIds);

    if (chapterCounts) {
      for (const pid of projectIds) {
        chapterCountByProject[pid] =
          chapterCounts.filter((c: { project_id: string }) => c.project_id === pid).length;
      }
    }
  } catch {
    // Service role not configured: use 0 for totalChapters
    for (const pid of projectIds) {
      chapterCountByProject[pid] = 0;
    }
  }

  return items.map((item) => ({
    publicationId: item.publicationId,
    title: item.title,
    coverImageUrl: item.coverImageUrl,
    slug: item.slug,
    totalChapters: chapterCountByProject[item.projectId] ?? 0,
    readCount: item.readCount,
    lastReadChapterId: item.lastReadChapterId,
    lastReadAt: item.lastReadAt,
  }));
}
