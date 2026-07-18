/**
 * User publication reading progress (watermark model).
 * ADR: docs/04-decisions/adr-reading-progress-watermark.md
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type { ChapterStatus, Chapter } from '../../../storage/database.js';
import { transformChapterFromDB } from '../../supabaseTransforms.js';
import { logger } from '../../../logger.js';
import {
  advanceWatermarkComplete,
  resolveContinueChapter,
  setWatermark,
} from '../../../shared/reading-progress.js';

export type ReadProgressUpdateMode = 'complete' | 'set';

export interface ReadProgressResult {
  lastReadChapterNumber: number;
}

/**
 * Get read progress watermark for a publication.
 * Returns 0 for guests.
 */
export async function getReadProgress(
  publicationId: string,
  userId: string | null,
  token: string | null
): Promise<ReadProgressResult> {
  if (!userId || !token) {
    return { lastReadChapterNumber: 0 };
  }

  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('user_publication_progress')
    .select('last_read_chapter_number')
    .eq('publication_id', publicationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, publicationId, userId }, 'Failed to get read progress');
    return { lastReadChapterNumber: 0 };
  }

  return {
    lastReadChapterNumber: (data?.last_read_chapter_number as number | null) ?? 0,
  };
}

/**
 * Update reading progress watermark.
 * - complete: N = max(N, chapterNumber)
 * - set: N = chapterNumber
 */
export async function updateReadProgress(
  userId: string,
  publicationId: string,
  chapterNumber: number,
  mode: ReadProgressUpdateMode,
  token: string
): Promise<ReadProgressResult> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data: existing } = await client
    .from('user_publication_progress')
    .select('last_read_chapter_number')
    .eq('user_id', userId)
    .eq('publication_id', publicationId)
    .maybeSingle();

  const current = (existing?.last_read_chapter_number as number | null) ?? 0;
  const next =
    mode === 'set' ? setWatermark(chapterNumber) : advanceWatermarkComplete(current, chapterNumber);

  const { error } = await client.from('user_publication_progress').upsert(
    {
      user_id: userId,
      publication_id: publicationId,
      last_read_chapter_number: next,
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,publication_id',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    throw new Error(`Failed to update read progress: ${error.message}`);
  }

  return { lastReadChapterNumber: next };
}

/**
 * Reset reading progress for a publication (N = 0).
 */
export async function resetReadProgress(
  userId: string,
  publicationId: string,
  token: string
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client
    .from('user_publication_progress')
    .delete()
    .eq('user_id', userId)
    .eq('publication_id', publicationId);

  if (error) {
    throw new Error(`Failed to reset read progress: ${error.message}`);
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
  lastReadChapterNumber: number;
  continueChapterId: string | null;
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
      return undefined;
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
      last_read_chapter_number,
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

  const items: Array<{
    publicationId: string;
    title: string | null;
    coverImageUrl: string | null;
    slug: string | null;
    projectId: string;
    lastReadChapterNumber: number;
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

    const watermark = (row.last_read_chapter_number as number | null) ?? 0;
    if (watermark <= 0) continue;

    items.push({
      publicationId: row.publication_id as string,
      title: pub.title ?? null,
      coverImageUrl: pub.cover_image_url ?? null,
      slug: pub.slug ?? null,
      projectId: pub.project_id,
      lastReadChapterNumber: watermark,
      lastReadAt: (row.last_read_at as string | null) ?? null,
    });
  }

  if (items.length === 0) return [];

  const projectIds = [...new Set(items.map((i) => i.projectId))];
  const chapterCountByProject: Record<string, number> = {};
  const readCountByPublication: Record<string, number> = {};
  const continueChapterByPublication: Record<string, string | null> = {};
  const chaptersByProject: Record<
    string,
    Array<{ id: string; number: number; hasTranslation: boolean }>
  > = {};

  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapterCounts, error: countError } = await serviceClient.rpc(
      'get_chapter_counts_by_projects',
      { p_project_ids: projectIds }
    );

    if (!countError && chapterCounts) {
      for (const row of chapterCounts as Array<{ project_id: string; total_count: number }>) {
        chapterCountByProject[row.project_id] = Number(row.total_count ?? 0);
      }
    }

    const { data: chapterRows, error: chError } = await serviceClient
      .from('chapters')
      .select('project_id, id, number')
      .in('project_id', projectIds);

    const { data: translatedRows, error: trError } = await serviceClient
      .from('chapters')
      .select('id')
      .in('project_id', projectIds)
      .not('translated_text', 'is', null);

    const translatedIds = new Set(
      !trError && translatedRows
        ? (translatedRows as Array<{ id: string }>).map((row) => row.id)
        : []
    );

    if (!chError && chapterRows) {
      for (const ch of chapterRows as Array<{ project_id: string; id: string; number: number }>) {
        if (!chaptersByProject[ch.project_id]) chaptersByProject[ch.project_id] = [];
        chaptersByProject[ch.project_id]!.push({
          id: ch.id,
          number: ch.number,
          hasTranslation: translatedIds.has(ch.id),
        });
      }
      for (const item of items) {
        const chapterList = chaptersByProject[item.projectId] ?? [];
        readCountByPublication[item.publicationId] = chapterList.filter(
          (ch) => ch.number <= item.lastReadChapterNumber
        ).length;
        const continueCh = resolveContinueChapter(chapterList, item.lastReadChapterNumber);
        continueChapterByPublication[item.publicationId] = continueCh?.id ?? null;
      }
    }
  } catch {
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
    readCount: readCountByPublication[item.publicationId] ?? 0,
    lastReadChapterNumber: item.lastReadChapterNumber,
    continueChapterId: continueChapterByPublication[item.publicationId] ?? null,
    lastReadAt: item.lastReadAt,
  }));
}
