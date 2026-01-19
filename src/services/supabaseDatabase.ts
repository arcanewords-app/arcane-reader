/**
 * Supabase Database Service
 *
 * Replaces LowDB operations with Supabase PostgreSQL queries
 * All functions maintain the same interface as database.ts for compatibility
 */

import { supabase, createClientWithToken } from './supabaseClient.js';
import { validateToken } from '../utils/tokenValidation.js';
import type {
  Project,
  Chapter,
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
  getChapterStats,
  DEFAULT_READER_SETTINGS,
} from '../storage/database.js';
import { randomUUID } from 'crypto';

// ============================================
// Type Transformations (DB snake_case <-> App camelCase)
// ============================================

/**
 * Transform Supabase project row to Project type
 */
function transformProjectFromDB(
  row: any,
  chapters: Chapter[] = [],
  glossary: GlossaryEntry[] = []
): Project {
  return {
    id: row.id,
    name: row.name,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    settings: (row.settings as ProjectSettings) || getDefaultProjectSettings(),
    chapters,
    glossary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform Project to Supabase insert/update format
 */
function transformProjectToDB(project: Partial<Project>): any {
  return {
    name: project.name,
    source_language: project.sourceLanguage,
    target_language: project.targetLanguage,
    settings: project.settings,
  };
}

/**
 * Transform Supabase chapter row to Chapter type
 */
function transformChapterFromDB(row: any, paragraphs: Paragraph[] = []): Chapter {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    originalText: row.original_text,
    translatedText: row.translated_text || undefined,
    translatedChunks: row.translated_chunks || undefined,
    status: row.status as ChapterStatus,
    translationMeta: row.translation_meta
      ? (row.translation_meta as Chapter['translationMeta'])
      : undefined,
    paragraphs,
    // Note: paragraphs are loaded separately and attached
  };
}

/**
 * Transform Chapter to Supabase insert/update format
 */
function transformChapterToDB(chapter: Partial<Chapter>): any {
  const result: any = {};
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
function transformParagraphFromDB(row: any): Paragraph {
  return {
    id: row.id,
    index: row.index,
    originalText: row.original_text,
    translatedText: row.translated_text || undefined,
    status: row.status as ParagraphStatus,
    editedAt: row.edited_at || undefined,
    editedBy: (row.edited_by as 'ai' | 'user') || undefined,
  };
}

/**
 * Transform Supabase glossary entry row to GlossaryEntry type
 */
function transformGlossaryEntryFromDB(row: any): GlossaryEntry {
  // Migrate imageUrl to imageUrls array if needed (legacy support)
  let imageUrls = row.image_urls || [];
  if (row.image_url && !imageUrls.includes(row.image_url)) {
    imageUrls = [row.image_url, ...imageUrls];
  }

  return {
    id: row.id,
    type: row.type as 'character' | 'location' | 'term',
    original: row.original,
    translated: row.translated,
    gender: (row.gender as GlossaryEntry['gender']) || undefined,
    declensions: row.declensions ? (row.declensions as GlossaryEntry['declensions']) : undefined,
    description: row.description || undefined,
    notes: row.notes || undefined,
    firstAppearance: row.first_appearance || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined, // Legacy support
    autoDetected: row.auto_detected || false,
  };
}

/**
 * Get default project settings
 */
function getDefaultProjectSettings(): ProjectSettings {
  return {
    stageModels: {
      analysis: 'gpt-4o-mini',
      translation: 'gpt-4o-mini',
      editing: 'gpt-4o-mini',
    },
    temperature: 0.5,
    enableAnalysis: true,
    enableTranslation: true,
    enableEditing: true,
    reader: { ...DEFAULT_READER_SETTINGS },
  };
}

// ============================================
// Project Operations
// ============================================

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
 * Get a single project by ID
 */
export async function getProject(
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

  // Load chapters and glossary
  const [chapters, glossary] = await Promise.all([
    loadChaptersForProject(project.id, token),
    loadGlossaryForProject(project.id, token),
  ]);

  return transformProjectFromDB(project, chapters, glossary);
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

  console.log(`📁 Создан проект: ${project.name} (${project.id})`);

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
): Promise<Project | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const projectData = transformProjectToDB(updates);

  const { data: project, error } = await client
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

  // Merge reader settings
  const updatedReaderSettings = {
    ...project.settings.reader,
    ...updates,
  };

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
 * Get reader settings from project
 */
export function getReaderSettings(project: Project): ReaderSettings {
  return project.settings.reader || DEFAULT_READER_SETTINGS;
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
 * Load all chapters for a project (with paragraphs)
 */
async function loadChaptersForProject(projectId: string, token: string): Promise<Chapter[]> {
  const client = createClientWithToken(token);

  const { data: chapters, error } = await client
    .from('chapters')
    .select('*')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load chapters: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return [];
  }

  // Load paragraphs for each chapter with auto-sync recovery
  const chaptersWithParagraphs = await Promise.all(
    chapters.map(async (chapter) => {
      let paragraphs = await loadParagraphsForChapter(chapter.id, token);
      const chapterData = transformChapterFromDB(chapter, paragraphs);

      // Auto-sync check: if chapter has translation but paragraphs are empty, restore sync
      const hasTranslation = 
        (chapterData.translatedChunks && chapterData.translatedChunks.length > 0) ||
        (chapterData.translatedText && chapterData.translatedText.trim().length > 0);

      const hasEmptyParagraphs = paragraphs.length > 0 && 
        !paragraphs.some((p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0);

      if (hasTranslation && hasEmptyParagraphs && chapterData.translatedChunks && chapterData.translatedChunks.length > 0) {
        // Auto-recovery: sync translatedChunks to paragraphs
        console.log(`🔄 Автоматическое восстановление синхронизации параграфов для главы: ${chapterData.title}`);
        
        const syncedParagraphs = autoSyncChunksToParagraphs(paragraphs, chapterData.translatedChunks);
        
        if (syncedParagraphs.some((p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0)) {
          // Update paragraphs in database
          await Promise.all(
            syncedParagraphs.map(async (paragraph: Paragraph) => {
              const paragraphData: any = {};
              if (paragraph.translatedText !== undefined)
                paragraphData.translated_text = paragraph.translatedText || null;
              if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
              if (paragraph.editedAt !== undefined) paragraphData.edited_at = paragraph.editedAt || null;
              if (paragraph.editedBy !== undefined) paragraphData.edited_by = paragraph.editedBy || null;

              const { error } = await client
                .from('paragraphs')
                .update(paragraphData)
                .eq('id', paragraph.id)
                .eq('chapter_id', chapter.id);

              if (error) {
                console.error(`Failed to update paragraph ${paragraph.id}:`, error.message);
              }
            })
          );

          // Reload updated paragraphs
          paragraphs = await loadParagraphsForChapter(chapter.id, token);
          
          const syncedCount = paragraphs.filter((p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0).length;
          console.log(`✅ Восстановлено ${syncedCount} параграфов из ${chapterData.translatedChunks.length} чанков`);
        }
      }

      return transformChapterFromDB(chapter, paragraphs);
    })
  );

  return chaptersWithParagraphs;
}

/**
 * Load all paragraphs for a chapter
 */
async function loadParagraphsForChapter(chapterId: string, token: string): Promise<Paragraph[]> {
  const client = token ? createClientWithToken(token) : supabase;

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
  const { data: maxChapter, error: maxError } = await client
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

  console.log(
    `📖 Добавлена глава: ${chapter.title} -> ${project.name} (${paragraphs.length} абзацев)`
  );

  // Reload chapter with paragraphs
  const paragraphsList = await loadParagraphsForChapter(chapter.id, token);
  return transformChapterFromDB(chapter, paragraphsList);
}

/**
 * Update a chapter
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function updateChapter(
  projectId: string,
  chapterId: string,
  updates: Partial<Chapter>,
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

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

  // Update paragraphs if provided
  if (updates.paragraphs && Array.isArray(updates.paragraphs)) {
    // Update each paragraph individually
    // Use Promise.all for parallel updates
    await Promise.all(
      updates.paragraphs.map(async (paragraph) => {
        const paragraphData: any = {};
        if (paragraph.translatedText !== undefined)
          paragraphData.translated_text = paragraph.translatedText || null;
        if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
        if (paragraph.editedAt !== undefined) paragraphData.edited_at = paragraph.editedAt || null;
        if (paragraph.editedBy !== undefined) paragraphData.edited_by = paragraph.editedBy || null;

        const { error } = await client
          .from('paragraphs')
          .update(paragraphData)
          .eq('id', paragraph.id)
          .eq('chapter_id', chapterId);

        if (error) {
          console.error(`Failed to update paragraph ${paragraph.id}:`, error.message);
          // Don't throw - continue with other paragraphs
        }
      })
    );

    console.log(`📝 Обновлено ${updates.paragraphs.length} параграфов в БД`);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  // Reload with paragraphs (will load updated paragraphs from DB)
  const paragraphs = await loadParagraphsForChapter(chapter.id, token);
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

/**
 * Get a single chapter
 * Note: Token is required for RLS authentication
 * @throws {Error} If token is required but not provided
 */
export async function getChapter(
  projectId: string,
  chapterId: string,
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

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
  let paragraphs = await loadParagraphsForChapter(chapter.id, token);
  const chapterData = transformChapterFromDB(chapter, paragraphs);

  // Auto-sync check: if chapter has translation but paragraphs are empty, restore sync
  const hasTranslation = 
    (chapterData.translatedChunks && chapterData.translatedChunks.length > 0) ||
    (chapterData.translatedText && chapterData.translatedText.trim().length > 0);

  const hasEmptyParagraphs = paragraphs.length > 0 && 
    !paragraphs.some(p => p.translatedText && p.translatedText.trim().length > 0);

  if (hasTranslation && hasEmptyParagraphs && chapterData.translatedChunks && chapterData.translatedChunks.length > 0) {
    // Auto-recovery: sync translatedChunks to paragraphs
    console.log(`🔄 Автоматическое восстановление синхронизации параграфов для главы: ${chapterData.title}`);
    
    const syncedParagraphs = autoSyncChunksToParagraphs(paragraphs, chapterData.translatedChunks);
    
    if (syncedParagraphs.some((p: Paragraph) => p.translatedText && p.translatedText.trim().length > 0)) {
      // Update paragraphs in database
      await Promise.all(
        syncedParagraphs.map(async (paragraph: Paragraph) => {
          const paragraphData: any = {};
          if (paragraph.translatedText !== undefined)
            paragraphData.translated_text = paragraph.translatedText || null;
          if (paragraph.status !== undefined) paragraphData.status = paragraph.status;
          if (paragraph.editedAt !== undefined) paragraphData.edited_at = paragraph.editedAt || null;
          if (paragraph.editedBy !== undefined) paragraphData.edited_by = paragraph.editedBy || null;

          const { error } = await client
            .from('paragraphs')
            .update(paragraphData)
            .eq('id', paragraph.id)
            .eq('chapter_id', chapterId);

          if (error) {
            console.error(`Failed to update paragraph ${paragraph.id}:`, error.message);
          }
        })
      );

      // Reload updated paragraphs
      paragraphs = await loadParagraphsForChapter(chapter.id, token);
      
      const syncedCount = paragraphs.filter(p => p.translatedText && p.translatedText.trim().length > 0).length;
      console.log(`✅ Восстановлено ${syncedCount} параграфов из ${chapterData.translatedChunks.length} чанков`);
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

  console.log(`🗑️ Удалена глава: ${chapter.title}`);

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
  const [movedChapter] = sortedChapters.splice(chapterIndex, 1);
  sortedChapters.splice(newNumber - 1, 0, movedChapter);

  // Update all chapter numbers
  for (let i = 0; i < sortedChapters.length; i++) {
    const newNum = i + 1;
    if (sortedChapters[i].number !== newNum) {
      await client.from('chapters').update({ number: newNum }).eq('id', sortedChapters[i].id);
    }
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  console.log(`🔢 Номер главы изменён: ${chapterId} ${oldNumber} → ${newNumber}`);

  return getChapter(projectId, chapterId, token);
}

/**
 * Helper: Renumber chapters sequentially starting from 1
 */
async function renumberChapters(projectId: string, token: string): Promise<void> {
  const client = createClientWithToken(token);

  const { data: chapters, error } = await client
    .from('chapters')
    .select('id')
    .eq('project_id', projectId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to get chapters for renumbering: ${error.message}`);
  }

  if (!chapters || chapters.length === 0) {
    return;
  }

  // Update each chapter's number sequentially
  for (let i = 0; i < chapters.length; i++) {
    const newNumber = i + 1;
    await client.from('chapters').update({ number: newNumber }).eq('id', chapters[i].id);
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
    type: entry.type,
    original: entry.original,
    translated: entry.translated,
    gender: entry.gender || null,
    declensions: entry.declensions || null,
    description: entry.description || null,
    notes: entry.notes || null,
    first_appearance: entry.firstAppearance || null,
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

  const entryData: any = {};
  if (updates.type !== undefined) entryData.type = updates.type;
  if (updates.original !== undefined) entryData.original = updates.original;
  if (updates.translated !== undefined) entryData.translated = updates.translated;
  if (updates.gender !== undefined) entryData.gender = updates.gender || null;
  if (updates.declensions !== undefined) entryData.declensions = updates.declensions || null;
  if (updates.description !== undefined) entryData.description = updates.description || null;
  if (updates.notes !== undefined) entryData.notes = updates.notes || null;
  if (updates.firstAppearance !== undefined)
    entryData.first_appearance = updates.firstAppearance || null;
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
  const paragraphData: any = {};
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
