/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { getTranslationCoverage } from '../../../shared/chapterTranslationCoverage.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type { Chapter, Paragraph } from '../../../storage/database.js';
import { parseTextToParagraphs } from '../../../storage/database.js';
import { logger } from '../../../logger.js';
import { transformChapterFromDB, transformChapterToDB } from '../../supabaseTransforms.js';
import { autoSyncChunksToParagraphs } from '../pure/chapterSync.js';
import { loadParagraphsForChapter } from '../loaders.js';

/**
 * Add a new chapter to a project
 */
const addChapterLocks = new Map<string, Array<() => void>>();

async function acquireAddChapterLock(projectId: string): Promise<void> {
  return new Promise((resolve) => {
    const queue = addChapterLocks.get(projectId) || [];
    queue.push(resolve);
    addChapterLocks.set(projectId, queue);
    if (queue.length === 1) {
      resolve();
    }
  });
}

function releaseAddChapterLock(projectId: string): void {
  const queue = addChapterLocks.get(projectId);
  if (!queue) return;
  queue.shift();
  if (queue.length === 0) {
    addChapterLocks.delete(projectId);
    return;
  }
  queue[0]();
}

export async function addChapter(
  projectId: string,
  data: { title: string; originalText: string },
  token: string
): Promise<Chapter | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);
  await acquireAddChapterLock(projectId);
  try {
    // Verify project exists (RLS will ensure user has access)
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return undefined;
    }

    // Serialize local writes to reduce race conditions on chapter numbering.
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
  } finally {
    releaseAddChapterLock(projectId);
  }
}

export interface ImportChapterBatchInputItem {
  title: string;
  originalText: string;
}

export interface ImportChapterBatchResultItem {
  sourceIndex: number;
  chapterId: string;
  number: number;
  title: string;
  paragraphsCount: number;
}

/**
 * Import many chapters in one RPC call.
 * Uses DB-side transaction to keep numbering and paragraph inserts consistent.
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function importChaptersBatch(
  projectId: string,
  chapters: ImportChapterBatchInputItem[],
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<ImportChapterBatchResultItem[]> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const payload = chapters.map((chapter, index) => ({
    source_index: index,
    title: chapter.title,
    content: chapter.originalText,
  }));

  const { data, error } = await client.rpc('import_chapters_batch', {
    p_project_id: projectId,
    p_chapters: payload,
    p_start_number: null,
  });

  if (error) {
    throw new Error(`Failed to import chapters batch: ${error.message}`);
  }

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows
    .map((row) => ({
      sourceIndex: Number(row.source_index),
      chapterId: String(row.chapter_id || ''),
      number: Number(row.number),
      title: String(row.title || ''),
      paragraphsCount: Number(row.paragraphs_count || 0),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.sourceIndex) &&
        item.chapterId.length > 0 &&
        Number.isFinite(item.number) &&
        Number.isFinite(item.paragraphsCount)
    )
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
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
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
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
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
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

  // Lazy backfill: completed status but incomplete paragraph coverage → partial
  let chapterRow = chapter;
  const coverage = getTranslationCoverage(paragraphs);
  if (chapterData.status === 'completed' && !coverage.isComplete && coverage.translatedCount > 0) {
    logger.info(
      {
        event: 'chapter.status.backfill_partial',
        chapterId,
        contentTotal: coverage.contentTotal,
        translatedCount: coverage.translatedCount,
      },
      'Lazy backfill: downgrading completed chapter to partial'
    );
    const { error: statusError } = await client
      .from('chapters')
      .update({ status: 'partial' })
      .eq('id', chapterId)
      .eq('project_id', projectId);
    if (!statusError) {
      chapterRow = { ...chapter, status: 'partial' };
    } else {
      logger.warn(
        { chapterId, error: statusError.message },
        'Lazy backfill: failed to update chapter status to partial'
      );
    }
  }

  return transformChapterFromDB(chapterRow, paragraphs);
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

export interface MarkTranslatedBatchResult {
  summary: MarkTranslatedBatchSummary;
  results: MarkTranslatedBatchResultItem[];
}

/**
 * Batch "mark as translated" via PostgreSQL RPC.
 * Uses DB-side per-chapter transaction logic and returns structured per-item results.
 */
export async function markChaptersAsTranslatedBatch(
  projectId: string,
  chapterIds: string[],
  token: string,
  options?: { continueOnError?: boolean }
): Promise<MarkTranslatedBatchResult> {
  validateToken(token);
  const client = createClientWithToken(token);
  const dedupedIds = Array.from(new Set(chapterIds.filter((id) => !!id)));
  if (dedupedIds.length === 0) {
    return {
      summary: { total: 0, processed: 0, success: 0, failed: 0, skipped: 0 },
      results: [],
    };
  }

  const continueOnError = options?.continueOnError ?? true;
  const { data, error } = await client.rpc('mark_chapters_as_translated_batch', {
    p_project_id: projectId,
    p_chapter_ids: dedupedIds,
    p_continue_on_error: continueOnError,
  });

  if (error) {
    logger.error(
      { projectId, chaptersCount: dedupedIds.length, err: error },
      'mark_chapters_as_translated_batch RPC failed'
    );
    throw new Error(error.message || 'Failed to mark chapters as translated in batch');
  }

  const rows = Array.isArray(data) ? data : [];
  const normalizedResults: MarkTranslatedBatchResultItem[] = rows.map((row) => {
    const statusRaw = String((row as Record<string, unknown>).status || '').toLowerCase();
    const status: MarkTranslatedBatchStatus =
      statusRaw === 'success' || statusRaw === 'failed' || statusRaw === 'skipped'
        ? (statusRaw as MarkTranslatedBatchStatus)
        : 'failed';
    const chapterId = String((row as Record<string, unknown>).chapter_id || '');
    const reasonRaw = (row as Record<string, unknown>).reason;
    return {
      chapterId,
      status,
      reason: typeof reasonRaw === 'string' && reasonRaw.trim().length > 0 ? reasonRaw : undefined,
    };
  });

  const summary: MarkTranslatedBatchSummary = {
    total: dedupedIds.length,
    processed: normalizedResults.length,
    success: normalizedResults.filter((r) => r.status === 'success').length,
    failed: normalizedResults.filter((r) => r.status === 'failed').length,
    skipped: normalizedResults.filter((r) => r.status === 'skipped').length,
  };

  return { summary, results: normalizedResults };
}

/**
 * Helper: Renumber chapters sequentially starting from 1 (atomic via RPC)
 */
export async function renumberChapters(projectId: string, token: string): Promise<void> {
  const client = createClientWithToken(token);

  const { error } = await client.rpc('renumber_chapters_atomic', {
    p_project_id: projectId,
  });

  if (error) {
    throw new Error(`Failed to renumber chapters: ${error.message}`);
  }
}
