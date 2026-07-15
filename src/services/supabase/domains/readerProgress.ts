/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type { ChapterStatus, Chapter } from '../../../storage/database.js';
import { transformChapterFromDB } from '../../supabaseTransforms.js';
import { logger } from '../../../logger.js';

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
 * Update chapter status
 */
export async function updateChapterStatus(
  projectId: string,
  chapterId: string,
  status: ChapterStatus,
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: chapter, error } = await client
    .from('chapters')
    .update({ status })
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return undefined; // Not found
    }
    throw new Error(`Failed to update chapter status: ${error.message}`);
  }

  logger.info(
    {
      event: 'chapter.status_updated',
      chapterId,
      chapterTitle: chapter.title,
      status,
    },
    `Chapter status updated: "${chapter.title}" → ${status}`
  );

  return transformChapterFromDB(chapter);
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

  // Get chapter counts per project via RPC (bypasses PostgREST 1000 row limit)
  const projectIds = [...new Set(items.map((i) => i.projectId))];
  const chapterCountByProject: Record<string, number> = {};

  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapterCounts, error } = await serviceClient.rpc(
      'get_chapter_counts_by_projects',
      { p_project_ids: projectIds }
    );

    if (!error && chapterCounts) {
      for (const row of chapterCounts as Array<{ project_id: string; total_count: number }>) {
        chapterCountByProject[row.project_id] = Number(row.total_count ?? 0);
      }
    }
  } catch {
    // Service role not configured or RPC missing: use 0 for totalChapters
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
