/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chapterDisplayTitle } from '../../../shared/chapterTitle.js';
import { getChapter } from './chapters.js';
import type { Paragraph } from '../../../storage/database.js';
import { mergeParagraphsToText } from '../../../storage/database.js';
import { escapeIlike, transformParagraphFromDB } from '../../supabaseTransforms.js';
import {
  createMatchSnippet,
  paragraphMatchesSearch,
  type ProjectSearchMatchBase,
} from '../../../shared/projectSearch.js';

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
    await syncChapterTranslatedTextFromDb(projectId, chapterId, token, client);
  }

  // Update project updated_at
  await client.from('projects').update({}).eq('id', projectId);

  return transformParagraphFromDB(updatedParagraph);
}

async function syncChapterTranslatedTextFromDb(
  projectId: string,
  chapterId: string,
  token: string,
  client: SupabaseClient
): Promise<void> {
  const fullChapter = await getChapter(projectId, chapterId, token);
  if (!fullChapter?.paragraphs) return;

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

export interface ProjectSearchMatch extends ProjectSearchMatchBase {}

export interface ProjectSearchParams {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  chapterIds?: string[];
  chapterFrom?: number;
  chapterTo?: number;
  offset?: number;
  limit?: number;
}

export interface ProjectSearchResult {
  matches: ProjectSearchMatch[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

const DEFAULT_SEARCH_LIMIT = 200;

interface SearchParagraphRpcRow {
  paragraph_id: string;
  paragraph_index: number;
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_translated_title: string | null;
  match_field: string;
  original_text: string | null;
  translated_text: string | null;
}

/**
 * Search paragraphs across project via single RPC (JOIN + LIMIT).
 * Falls back is not used — migration must be applied in Supabase.
 */
export async function searchParagraphsInProject(
  projectId: string,
  query: string,
  field: 'original' | 'translated' | 'both',
  token: string,
  params: ProjectSearchParams = {}
): Promise<ProjectSearchResult> {
  validateToken(token);
  const trimmed = query.trim().slice(0, 500);
  if (!trimmed) {
    return { matches: [], total: 0, hasMore: false };
  }

  const {
    caseSensitive = false,
    wholeWord = false,
    chapterIds,
    chapterFrom,
    chapterTo,
    offset = 0,
    limit = DEFAULT_SEARCH_LIMIT,
  } = params;

  const pageLimit = Math.min(Math.max(limit, 1), 500);
  const fetchLimit = wholeWord ? Math.min(pageLimit * 3, 500) : pageLimit + 1;

  const client = createClientWithToken(token);
  const pattern = `%${escapeIlike(trimmed)}%`;
  const searchOptions = { caseSensitive, wholeWord };

  const { data, error } = await client.rpc('search_paragraphs_in_project', {
    p_project_id: projectId,
    p_pattern: pattern,
    p_field: field,
    p_case_sensitive: caseSensitive,
    p_chapter_from: chapterFrom ?? null,
    p_chapter_to: chapterTo ?? null,
    p_chapter_ids: chapterIds?.length ? chapterIds : null,
    p_offset: offset,
    p_limit: fetchLimit,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const rows = (data ?? []) as SearchParagraphRpcRow[];
  const matches: ProjectSearchMatch[] = [];

  for (const row of rows) {
    const matchField: 'original' | 'translated' =
      row.match_field === 'original' ? 'original' : 'translated';
    const fullText = (matchField === 'original' ? row.original_text : row.translated_text) || '';
    if (!paragraphMatchesSearch(fullText, trimmed, searchOptions)) continue;

    matches.push({
      chapterId: row.chapter_id,
      chapterNumber: row.chapter_number,
      chapterTitle: chapterDisplayTitle({
        title: row.chapter_title,
        translatedTitle: row.chapter_translated_title,
        number: row.chapter_number,
      }),
      paragraphId: row.paragraph_id,
      paragraphIndex: row.paragraph_index + 1,
      field: matchField,
      snippet: createMatchSnippet(fullText, trimmed, caseSensitive),
      fullText,
    });

    if (matches.length > pageLimit) break;
  }

  const hasMore = matches.length > pageLimit || rows.length >= fetchLimit;
  const pageMatches = matches.slice(0, pageLimit);

  return {
    matches: pageMatches,
    total: pageMatches.length,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : undefined,
  };
}

export interface BulkParagraphUpdate {
  chapterId: string;
  paragraphId: string;
  translatedText: string;
}

export interface ParagraphForAiReplace {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  paragraphId: string;
  paragraphIndex: number;
  translatedText: string;
}

/**
 * Load paragraph translated text for AI replace. Verifies project ownership via chapter join.
 */
export async function loadParagraphsForAiReplace(
  projectId: string,
  refs: Array<{ chapterId: string; paragraphId: string }>,
  token: string
): Promise<ParagraphForAiReplace[]> {
  validateToken(token);
  if (refs.length === 0) return [];

  const client = createClientWithToken(token);
  const paragraphIds = [...new Set(refs.map((r) => r.paragraphId))];
  const refByParagraphId = new Map(refs.map((r) => [r.paragraphId, r.chapterId]));

  const { data, error } = await client
    .from('paragraphs')
    .select('id, index, translated_text, chapter_id, chapters!inner(number, title, project_id)')
    .in('id', paragraphIds)
    .eq('chapters.project_id', projectId);

  if (error) {
    throw new Error(`Failed to load paragraphs: ${error.message}`);
  }

  const results: ParagraphForAiReplace[] = [];
  for (const row of data ?? []) {
    const chapterId = row.chapter_id as string;
    const expectedChapterId = refByParagraphId.get(row.id as string);
    if (!expectedChapterId || expectedChapterId !== chapterId) continue;

    const chapterRaw = row.chapters as
      { number: number; title: string | null } | { number: number; title: string | null }[] | null;
    const chapter = Array.isArray(chapterRaw) ? chapterRaw[0] : chapterRaw;
    if (!chapter) continue;
    results.push({
      chapterId,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title ?? '',
      paragraphId: row.id as string,
      paragraphIndex: row.index as number,
      translatedText: (row.translated_text as string | null) ?? '',
    });
  }

  return results;
}

export interface BulkUpdateResult {
  succeeded: string[];
  failed: Array<{ paragraphId: string; error: string }>;
}

/**
 * Bulk update paragraph translated text. Returns succeeded and failed.
 * Groups updates by chapter and syncs translated_text once per chapter.
 */
export async function bulkUpdateParagraphs(
  projectId: string,
  updates: BulkParagraphUpdate[],
  token: string
): Promise<BulkUpdateResult> {
  validateToken(token);

  const succeeded: string[] = [];
  const failed: Array<{ paragraphId: string; error: string }> = [];
  const client = createClientWithToken(token);
  const editedAt = new Date().toISOString();

  const byChapter = new Map<string, BulkParagraphUpdate[]>();
  for (const u of updates) {
    const list = byChapter.get(u.chapterId) ?? [];
    list.push(u);
    byChapter.set(u.chapterId, list);
  }

  const BATCH_SIZE = 15;

  for (const [chapterId, chapterUpdates] of byChapter) {
    const { data: chapter } = await client
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('project_id', projectId)
      .single();

    if (!chapter) {
      for (const u of chapterUpdates) {
        failed.push({ paragraphId: u.paragraphId, error: 'Chapter not found' });
      }
      continue;
    }

    const chapterSucceeded: string[] = [];

    for (let i = 0; i < chapterUpdates.length; i += BATCH_SIZE) {
      const batch = chapterUpdates.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (u) => {
          const { error } = await client
            .from('paragraphs')
            .update({
              translated_text: u.translatedText || null,
              status: 'edited',
              edited_at: editedAt,
              edited_by: 'user',
            })
            .eq('id', u.paragraphId)
            .eq('chapter_id', chapterId);

          if (error) {
            return {
              paragraphId: u.paragraphId,
              ok: false as const,
              error: error.message,
            };
          }
          return { paragraphId: u.paragraphId, ok: true as const };
        })
      );

      for (const r of results) {
        if (r.ok) {
          chapterSucceeded.push(r.paragraphId);
        } else {
          failed.push({ paragraphId: r.paragraphId, error: r.error });
        }
      }

      if (i + BATCH_SIZE < chapterUpdates.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    if (chapterSucceeded.length > 0) {
      try {
        await syncChapterTranslatedTextFromDb(projectId, chapterId, token, client);
        succeeded.push(...chapterSucceeded);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Chapter sync failed';
        for (const id of chapterSucceeded) {
          failed.push({ paragraphId: id, error: msg });
        }
      }
    }
  }

  if (succeeded.length > 0) {
    await client.from('projects').update({}).eq('id', projectId);
  }

  return { succeeded, failed };
}
