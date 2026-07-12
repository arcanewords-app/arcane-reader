/**
 * Extracted from supabaseDatabase.ts
 */

import { supabase, createClientWithToken } from '../supabaseClient.js';
import { CHAPTER_LOAD_BATCH, POSTGREST_MAX_ROWS } from '../../shared/cacheContract.js';
import { groupParagraphRowsByChapterId, type ParagraphRow } from '../paragraphLoader.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Project,
  Chapter,
  ChapterListItem,
  GlossaryEntry,
  Paragraph,
} from '../../storage/database.js';
import { logger } from '../../logger.js';
import {
  transformChapterFromDB,
  transformChapterListItemFromDB,
  transformGlossaryEntryFromDB,
  transformParagraphFromDB,
  transformProjectFromDB,
} from '../supabaseTransforms.js';
import { autoSyncChunksToParagraphs } from './pure/chapterSync.js';

/**
 * Load lightweight chapter list for a project (no paragraphs, no text).
 * Uses pagination to bypass PostgREST 1000 row limit.
 */
export async function loadChaptersForProjectLightweight(
  projectId: string,
  token: string
): Promise<ChapterListItem[]> {
  const client = createClientWithToken(token);
  const allChapters: ChapterListItem[] = [];
  let offset = 0;

  for (;;) {
    const { data: chapters, error } = await client
      .from('chapters')
      .select(
        'id, number, title, translated_title, status, translation_meta, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('number', { ascending: true })
      .range(offset, offset + POSTGREST_MAX_ROWS - 1);

    if (error) {
      throw new Error(`Failed to load chapters: ${error.message}`);
    }

    if (!chapters || chapters.length === 0) {
      break;
    }

    for (const ch of chapters) {
      allChapters.push(transformChapterListItemFromDB(ch as Record<string, unknown>));
    }

    if (chapters.length < POSTGREST_MAX_ROWS) {
      break;
    }
    offset += POSTGREST_MAX_ROWS;
  }

  return allChapters;
}

/**
 * Load all chapters for a project (with paragraphs).
 * Uses small chapter batches; paragraphs are paginated (PostgREST 1000-row cap per request).
 */
export async function loadChaptersForProject(projectId: string, token: string): Promise<Chapter[]> {
  const client = createClientWithToken(token);
  const allChapters: Chapter[] = [];
  let offset = 0;

  for (;;) {
    // 1. Load chapters batch (without paragraphs) - small batch to avoid timeout
    const { data: chapters, error } = await client
      .from('chapters')
      .select('*')
      .eq('project_id', projectId)
      .order('number', { ascending: true })
      .range(offset, offset + CHAPTER_LOAD_BATCH - 1);

    if (error) {
      throw new Error(`Failed to load chapters: ${error.message}`);
    }

    if (!chapters || chapters.length === 0) {
      break;
    }

    const chapterIds = chapters.map((c) => c.id);

    // 2. Load paragraphs for this batch (paginated — PostgREST max 1000 rows per request)
    const paragraphsByChapterMap = await loadParagraphsForChapterIds(client, chapterIds);

    // Log loaded chapters order for debugging (only in development)
    if (process.env.NODE_ENV === 'development' && chapters.length <= 5 && offset === 0) {
      logger.debug(
        { projectId, chaptersCount: chapters.length },
        `Chapters loaded: ${chapters.map((c) => `${c.number}: ${c.id.substring(0, 8)} (${c.title})`).join(', ')}`
      );
    }

    // 3. Build chapters with paragraphs and auto-recovery
    const chaptersWithParagraphs = await Promise.all(
      chapters.map(async (chapter) => {
        let paragraphsList = paragraphsByChapterMap.get(chapter.id) ?? [];
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

    allChapters.push(...chaptersWithParagraphs);

    if (chapters.length < CHAPTER_LOAD_BATCH) {
      break;
    }
    offset += CHAPTER_LOAD_BATCH;
  }

  return allChapters;
}

/**
 * Load all chapters for a project using service role (no auth).
 * Used for publication export where project is loaded by publication.projectId.
 * Uses small batches to avoid statement timeout on large projects (no heavy JOIN).
 */
export async function loadChaptersForProjectWithServiceRole(projectId: string): Promise<Chapter[]> {
  const { createServiceRoleClient } = await import('../supabaseClient.js');
  const client = createServiceRoleClient();
  const allChapters: Chapter[] = [];
  let offset = 0;

  for (;;) {
    // 1. Load chapters batch (without paragraphs) - small batch to avoid timeout
    const { data: chapters, error } = await client
      .from('chapters')
      .select('*')
      .eq('project_id', projectId)
      .order('number', { ascending: true })
      .range(offset, offset + CHAPTER_LOAD_BATCH - 1);

    if (error) {
      throw new Error(`Failed to load chapters: ${error.message}`);
    }

    if (!chapters || chapters.length === 0) {
      break;
    }

    const chapterIds = chapters.map((c: { id: string }) => c.id);

    const paragraphsByChapterMap = await loadParagraphsForChapterIds(client, chapterIds);

    const batch = chapters.map((chapter: Record<string, unknown>) => {
      const paragraphs = paragraphsByChapterMap.get(chapter.id as string) ?? [];
      return transformChapterFromDB(chapter, paragraphs);
    });

    allChapters.push(...batch);

    if (chapters.length < CHAPTER_LOAD_BATCH) {
      break;
    }
    offset += CHAPTER_LOAD_BATCH;
  }

  return allChapters;
}

/**
 * Get project with full chapters for publication export.
 * Uses service role (no user auth) - call only when publication is verified published.
 */
export async function getProjectForPublicationExport(projectId: string): Promise<Project | null> {
  try {
    const { createServiceRoleClient } = await import('../supabaseClient.js');
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
 * Load paragraphs for multiple chapters with PostgREST pagination (1000 row cap per request).
 */
export async function loadParagraphsForChapterIds(
  client: SupabaseClient,
  chapterIds: string[]
): Promise<Map<string, Paragraph[]>> {
  const result = new Map<string, Paragraph[]>();
  if (chapterIds.length === 0) {
    return result;
  }

  for (const id of chapterIds) {
    result.set(id, []);
  }

  let offset = 0;
  for (;;) {
    const { data: page, error } = await client
      .from('paragraphs')
      .select('*')
      .in('chapter_id', chapterIds)
      .order('chapter_id', { ascending: true })
      .order('index', { ascending: true })
      .range(offset, offset + POSTGREST_MAX_ROWS - 1);

    if (error) {
      throw new Error(`Failed to load paragraphs: ${error.message}`);
    }

    const rows = (page ?? []) as ParagraphRow[];
    if (rows.length === 0) {
      break;
    }

    const grouped = groupParagraphRowsByChapterId(rows);
    for (const [chapterId, chapterRows] of grouped) {
      const existing = result.get(chapterId) ?? [];
      existing.push(...chapterRows.map((row) => transformParagraphFromDB(row)));
      result.set(chapterId, existing);
    }

    if (rows.length < POSTGREST_MAX_ROWS) {
      break;
    }
    offset += POSTGREST_MAX_ROWS;
  }

  for (const [chapterId, paragraphs] of result) {
    result.set(
      chapterId,
      paragraphs.sort((a, b) => a.index - b.index)
    );
  }

  return result;
}

/**
 * Load all paragraphs for a chapter.
 * When useServiceRole is true, uses service role client (for long-running server flows where JWT may expire).
 */
export async function loadParagraphsForChapter(
  chapterId: string,
  token: string | null,
  useServiceRole?: boolean
): Promise<Paragraph[]> {
  const client = useServiceRole
    ? (await import('../supabaseClient.js')).createServiceRoleClient()
    : token
      ? createClientWithToken(token)
      : supabase;

  const all: Paragraph[] = [];
  let offset = 0;

  for (;;) {
    const { data: page, error } = await client
      .from('paragraphs')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('index', { ascending: true })
      .range(offset, offset + POSTGREST_MAX_ROWS - 1);

    if (error) {
      throw new Error(`Failed to load paragraphs: ${error.message}`);
    }

    const rows = page ?? [];
    if (rows.length === 0) {
      break;
    }

    all.push(...rows.map((row) => transformParagraphFromDB(row as Record<string, unknown>)));

    if (rows.length < POSTGREST_MAX_ROWS) {
      break;
    }
    offset += POSTGREST_MAX_ROWS;
  }

  return all;
}

/**
 * Load all glossary entries for a project
 */
export async function loadGlossaryForProject(
  projectId: string,
  token: string
): Promise<GlossaryEntry[]> {
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
 * Load glossary entries for a project using service role (for public publication viewer).
 * Use only when publication is published; RLS blocks anon/user from reading project glossary.
 */
export async function loadGlossaryForProjectPublic(projectId: string): Promise<GlossaryEntry[]> {
  const { createServiceRoleClient } = await import('../supabaseClient.js');
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
 * Glossary entry count for a project (service role). Used by publication API for Glossary button visibility.
 */
export async function getGlossaryCountForProject(projectId: string): Promise<number> {
  const { createServiceRoleClient } = await import('../supabaseClient.js');
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
