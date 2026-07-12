/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken, supabase } from '../../supabaseClient.js';
import { PARAGRAPH_INSERT_BATCH, POSTGREST_MAX_ROWS } from '../../../shared/cacheContract.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import {
  createProjectLimitError,
  getProjectLimitForRole,
  isUnlimitedProjectLimit,
} from '../../../config/projectLimits.js';
import {
  remapPrimaryLocationId,
  remapRelatedEntryIds,
} from '../../../shared/glossaryCloneRemap.js';
import { filterNewGlossaryEntries, glossaryEntryKey } from '../../glossaryImportExport.js';
import { normalizeCloneChapterStatus } from '../../../shared/normalizeCloneChapterStatus.js';
import {
  copyFile,
  extractPathFromUrl,
  generateUniqueFilename,
  getPublicUrl,
} from '../../storage.js';
import type { UserRole } from '../../../types/roles.js';
import type { ProjectMetadata } from '../../../storage/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  ChapterSummary,
  GlossaryEntry,
  ReaderSettings,
  ChapterStatus,
} from '../../../storage/database.js';
import {
  DEFAULT_READER_SETTINGS,
  getReaderSettings as getReaderSettingsFromStorage,
  LEGACY_FONT_MAP,
} from '../../../storage/database.js';
import { logger } from '../../../logger.js';
import {
  transformChapterFromDB,
  transformParagraphFromDB,
  transformProjectFromDB,
  transformProjectFromDBWithChapterList,
  transformProjectListItemFromDB,
  transformProjectToDB,
  getDefaultProjectSettings,
  type ProjectListItemDB,
} from '../../supabaseTransforms.js';
import {
  createCloneIncompleteError,
  createSameProjectError,
  createTargetLanguageMismatchError,
  createInvalidChapterIdsError,
  createTransferIncompleteError,
} from '../pure/cloneErrors.js';
import {
  buildGlossaryCloneInsertRows,
  buildGlossaryTransferInsertRows,
  buildGlossaryIdMapFromExisting,
  CLONE_GLOSSARY_BATCH_SIZE,
} from '../pure/glossaryCopy.js';
import {
  loadChaptersForProject,
  loadChaptersForProjectLightweight,
  loadGlossaryForProject,
  loadParagraphsForChapterIds,
 loadGlossaryForProjectPublic } from '../loaders.js';
import { renumberChapters } from './chapters.js';

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
    .select(
      'id, name, type, settings, created_at, updated_at, metadata, source_language, target_language'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get projects: ${error.message}`);
  }

  if (!projects || projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((p) => p.id);

  const [chapterCountsResult, glossaryCounts] = await Promise.all([
    getChapterCountsByProjectRpc(client, projectIds),
    getGlossaryCountsByProject(client, projectIds),
  ]);
  const { chapterCounts, translatedCounts } = chapterCountsResult;

  return projects.map((p) =>
    transformProjectListItemFromDB(p as Record<string, unknown>, {
      chapterCount: chapterCounts[p.id] ?? 0,
      translatedCount: translatedCounts[p.id] ?? 0,
      glossaryCount: glossaryCounts[p.id] ?? 0,
    })
  );
}

/**
 * Get chapter counts via RPC (bypasses PostgREST 1000 row limit).
 */
async function getChapterCountsByProjectRpc(
  client: ReturnType<typeof createClientWithToken>,
  projectIds: string[]
): Promise<{ chapterCounts: Record<string, number>; translatedCounts: Record<string, number> }> {
  const chapterCounts: Record<string, number> = {};
  const translatedCounts: Record<string, number> = {};
  if (projectIds.length === 0) return { chapterCounts, translatedCounts };

  const { data, error } = await client.rpc('get_chapter_counts_by_projects', {
    p_project_ids: projectIds,
  });

  if (error) throw new Error(`Failed to get chapter counts: ${error.message}`);
  for (const row of data || []) {
    const pid = row.project_id as string;
    chapterCounts[pid] = Number(row.total_count ?? 0);
    translatedCounts[pid] = Number(row.translated_count ?? 0);
  }
  return { chapterCounts, translatedCounts };
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

const CLONE_CHAPTER_BATCH_SIZE = 25;

async function insertCloneParagraphRows(
  client: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += PARAGRAPH_INSERT_BATCH) {
    const chunk = rows.slice(i, i + PARAGRAPH_INSERT_BATCH);
    const { error } = await client.from('paragraphs').insert(chunk);
    if (error) {
      throw new Error(`Failed to clone paragraphs: ${error.message}`);
    }
  }
}

async function countParagraphsForProject(
  client: SupabaseClient,
  projectId: string
): Promise<number> {
  const { data: chapters, error: chError } = await client
    .from('chapters')
    .select('id')
    .eq('project_id', projectId);

  if (chError) {
    throw new Error(`Failed to count cloned paragraphs: ${chError.message}`);
  }
  if (!chapters?.length) {
    return 0;
  }

  const chapterIds = chapters.map((c) => c.id as string);
  const { count, error } = await client
    .from('paragraphs')
    .select('id', { count: 'exact', head: true })
    .in('chapter_id', chapterIds);

  if (error) {
    throw new Error(`Failed to count cloned paragraphs: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Count projects owned by a user.
 */
export async function countProjectsByUser(userId: string, token: string): Promise<number> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { count, error } = await client
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to count projects: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Throws PROJECT_LIMIT when the user cannot add another project.
 */
export async function assertCanAddProject(
  userId: string,
  role: UserRole,
  token: string
): Promise<void> {
  const limit = getProjectLimitForRole(role);
  if (isUnlimitedProjectLimit(limit)) {
    return;
  }

  const current = await countProjectsByUser(userId, token);
  if (current >= limit) {
    throw createProjectLimitError(limit, current);
  }
}

async function copyStorageImageUrl(
  url: string | undefined,
  targetProjectId: string,
  filenamePrefix: string
): Promise<string | undefined> {
  if (!url?.trim()) return undefined;

  const fromPath = extractPathFromUrl(url, 'images');
  if (!fromPath) return url;

  const ext = fromPath.split('.').pop() || 'jpg';
  const toPath = generateUniqueFilename(filenamePrefix, ext, targetProjectId);

  try {
    await copyFile('images', fromPath, toPath);
    return getPublicUrl('images', toPath);
  } catch (err) {
    logger.warn(
      { err, fromPath, toPath, targetProjectId },
      'Failed to copy storage image during project clone'
    );
    return url;
  }
}

/**
 * Clone a project (full snapshot: settings, metadata, chapters, glossary, images).
 * Does not copy publication or reader progress.
 */
export async function cloneProject(
  sourceProjectId: string,
  userId: string,
  token: string,
  options?: { name?: string; role?: UserRole }
): Promise<ProjectWithChapterList | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);

  const source = await getProjectFull(sourceProjectId, userId, token);
  if (!source) {
    return undefined;
  }

  await assertCanAddProject(userId, options?.role ?? 'author', token);

  const cloneName = options?.name?.trim() || `${source.name} (копия)`;
  const expectedParagraphCount = source.chapters.reduce(
    (sum, chapter) => sum + chapter.paragraphs.length,
    0
  );
  let newProjectId: string | null = null;

  try {
    const { data: insertedProject, error: projectError } = await client
      .from('projects')
      .insert({
        user_id: userId,
        name: cloneName,
        type: source.type || 'text',
        source_language: source.sourceLanguage,
        target_language: source.targetLanguage,
        settings: source.settings,
        metadata: source.metadata ?? {},
      })
      .select()
      .single();

    if (projectError || !insertedProject) {
      throw new Error(`Failed to create cloned project: ${projectError?.message ?? 'unknown'}`);
    }

    newProjectId = insertedProject.id as string;

    for (let offset = 0; offset < source.chapters.length; offset += CLONE_CHAPTER_BATCH_SIZE) {
      const batch = source.chapters.slice(offset, offset + CLONE_CHAPTER_BATCH_SIZE);

      for (const chapter of batch) {
        const status = normalizeCloneChapterStatus(chapter);
        const { data: newChapter, error: chapterError } = await client
          .from('chapters')
          .insert({
            project_id: newProjectId,
            number: chapter.number,
            title: chapter.title,
            translated_title: chapter.translatedTitle ?? null,
            original_text: chapter.originalText,
            translated_text: chapter.translatedText ?? null,
            translated_chunks: chapter.translatedChunks ?? null,
            status,
            translation_meta: chapter.translationMeta ?? null,
            critic_report: chapter.criticReport ?? null,
          })
          .select('id')
          .single();

        if (chapterError || !newChapter) {
          throw new Error(`Failed to clone chapter: ${chapterError?.message ?? 'unknown'}`);
        }

        if (chapter.paragraphs.length > 0) {
          const paragraphRows = chapter.paragraphs.map((p) => ({
            chapter_id: newChapter.id,
            index: p.index,
            original_text: p.originalText,
            translated_text: p.translatedText ?? null,
            status: p.status,
            edited_at: p.editedAt ?? null,
            edited_by: p.editedBy ?? null,
          }));

          await insertCloneParagraphRows(client, paragraphRows);
        }
      }
    }

    const actualParagraphCount = await countParagraphsForProject(client, newProjectId);
    if (actualParagraphCount !== expectedParagraphCount) {
      throw createCloneIncompleteError(expectedParagraphCount, actualParagraphCount);
    }

    const glossaryIdMap = new Map<string, string>();
    const insertedGlossaryIds: string[] = [];

    for (let offset = 0; offset < source.glossary.length; offset += CLONE_GLOSSARY_BATCH_SIZE) {
      const chunk = source.glossary.slice(offset, offset + CLONE_GLOSSARY_BATCH_SIZE);
      const rows = buildGlossaryCloneInsertRows(chunk, newProjectId);

      const { data: newEntries, error: glossaryError } = await client
        .from('glossary_entries')
        .insert(rows)
        .select('id');

      if (glossaryError) {
        throw new Error(`Failed to clone glossary: ${glossaryError.message}`);
      }

      if (newEntries?.length) {
        for (let i = 0; i < newEntries.length; i++) {
          const oldId = chunk[i]?.id;
          const newId = newEntries[i]?.id as string | undefined;
          if (oldId && newId) {
            glossaryIdMap.set(oldId, newId);
            insertedGlossaryIds.push(newId);
          }
        }
      }
    }

    for (const newEntryId of insertedGlossaryIds) {
      const oldEntry = source.glossary.find((e) => glossaryIdMap.get(e.id) === newEntryId);
      if (!oldEntry) continue;

      const remappedRelated = remapRelatedEntryIds(glossaryIdMap, oldEntry.relatedEntryIds);
      const remappedPrimary = remapPrimaryLocationId(glossaryIdMap, oldEntry.primaryLocationId);

      const copiedImageUrls: string[] = [];
      for (const imageUrl of oldEntry.imageUrls ?? []) {
        const copied = await copyStorageImageUrl(imageUrl, newProjectId, `glossary-${newEntryId}`);
        if (copied) copiedImageUrls.push(copied);
      }

      const updateData: Record<string, unknown> = {};
      if (remappedRelated?.length) {
        updateData.related_entry_ids = remappedRelated;
      }
      if (remappedPrimary) {
        updateData.primary_location_id = remappedPrimary;
      }
      if (copiedImageUrls.length > 0) {
        updateData.image_urls = copiedImageUrls;
      }

      if (Object.keys(updateData).length === 0) continue;

      const { error: updateError } = await client
        .from('glossary_entries')
        .update(updateData)
        .eq('id', newEntryId)
        .eq('project_id', newProjectId);

      if (updateError) {
        throw new Error(`Failed to update cloned glossary relations: ${updateError.message}`);
      }
    }

    const sourceCoverUrl = source.metadata?.coverImageUrl;
    if (sourceCoverUrl) {
      const copiedCover = await copyStorageImageUrl(sourceCoverUrl, newProjectId, 'cover');
      if (copiedCover && copiedCover !== sourceCoverUrl) {
        const mergedMetadata = { ...(source.metadata ?? {}), coverImageUrl: copiedCover };
        const { error: metaError } = await client
          .from('projects')
          .update({ metadata: mergedMetadata })
          .eq('id', newProjectId);
        if (metaError) {
          throw new Error(`Failed to update cloned cover metadata: ${metaError.message}`);
        }
      }
    }

    logger.info(
      {
        event: 'project.cloned',
        sourceProjectId,
        newProjectId,
        chapters: source.chapters.length,
        paragraphs: expectedParagraphCount,
        glossaryEntries: source.glossary.length,
      },
      `Project cloned: ${sourceProjectId} -> ${newProjectId}`
    );

    return getProject(newProjectId, userId, token);
  } catch (error) {
    if (newProjectId) {
      try {
        await deleteProject(newProjectId, userId, token);
      } catch (rollbackErr) {
        logger.error(
          { err: rollbackErr, newProjectId, sourceProjectId },
          'Failed to rollback partial project clone'
        );
      }
    }
    throw error;
  }
}

export type TransferChaptersResult = {
  chaptersTransferred: number;
  glossaryAdded: number;
  glossarySkipped: number;
  chapterNumberMap: Record<number, number>;
};

async function countParagraphsForChapterIds(
  client: SupabaseClient,
  chapterIds: string[]
): Promise<number> {
  if (chapterIds.length === 0) return 0;

  const { count, error } = await client
    .from('paragraphs')
    .select('id', { count: 'exact', head: true })
    .in('chapter_id', chapterIds);

  if (error) {
    throw new Error(`Failed to count paragraphs: ${error.message}`);
  }

  return count ?? 0;
}

async function rollbackInsertedChapters(
  client: SupabaseClient,
  targetProjectId: string,
  chapterIds: string[]
): Promise<void> {
  if (chapterIds.length === 0) return;

  const { error } = await client
    .from('chapters')
    .delete()
    .eq('project_id', targetProjectId)
    .in('id', chapterIds);

  if (error) {
    logger.error(
      { err: error, targetProjectId, chapterIds },
      'Failed to rollback transferred chapters'
    );
  }
}

async function appendGlossaryFromSource(
  client: SupabaseClient,
  sourceGlossary: GlossaryEntry[],
  targetProjectId: string,
  targetGlossary: GlossaryEntry[],
  chapterNumberMap: Map<number, number>
): Promise<{ added: number; skipped: number }> {
  const { toInsert, skipped } = filterNewGlossaryEntries(sourceGlossary, targetGlossary);
  if (toInsert.length === 0) {
    return { added: 0, skipped };
  }

  const glossaryIdMap = buildGlossaryIdMapFromExisting(sourceGlossary, targetGlossary);

  const insertedGlossaryIds: string[] = [];

  for (let offset = 0; offset < toInsert.length; offset += CLONE_GLOSSARY_BATCH_SIZE) {
    const chunk = toInsert.slice(offset, offset + CLONE_GLOSSARY_BATCH_SIZE);
    const rows = buildGlossaryTransferInsertRows(
      chunk as Array<Omit<GlossaryEntry, 'id'> & { translated?: string }>,
      sourceGlossary,
      targetProjectId,
      chapterNumberMap
    );

    const { data: newEntries, error: glossaryError } = await client
      .from('glossary_entries')
      .insert(rows)
      .select('id');

    if (glossaryError) {
      throw new Error(`Failed to transfer glossary: ${glossaryError.message}`);
    }

    if (newEntries?.length) {
      for (let i = 0; i < newEntries.length; i++) {
        const sourceEntry = chunk[i];
        const newId = newEntries[i]?.id as string | undefined;
        if (!sourceEntry || !newId) continue;
        const oldEntry = sourceGlossary.find(
          (e) =>
            glossaryEntryKey(e.type, e.original) ===
            glossaryEntryKey(sourceEntry.type ?? 'term', sourceEntry.original)
        );
        if (oldEntry) {
          glossaryIdMap.set(oldEntry.id, newId);
          insertedGlossaryIds.push(newId);
        }
      }
    }
  }

  for (const newEntryId of insertedGlossaryIds) {
    const oldEntry = sourceGlossary.find((e) => glossaryIdMap.get(e.id) === newEntryId);
    if (!oldEntry) continue;

    const remappedRelated = remapRelatedEntryIds(glossaryIdMap, oldEntry.relatedEntryIds);
    const remappedPrimary = remapPrimaryLocationId(glossaryIdMap, oldEntry.primaryLocationId);

    const copiedImageUrls: string[] = [];
    for (const imageUrl of oldEntry.imageUrls ?? []) {
      const copied = await copyStorageImageUrl(imageUrl, targetProjectId, `glossary-${newEntryId}`);
      if (copied) copiedImageUrls.push(copied);
    }

    const updateData: Record<string, unknown> = {};
    if (remappedRelated?.length) {
      updateData.related_entry_ids = remappedRelated;
    }
    if (remappedPrimary) {
      updateData.primary_location_id = remappedPrimary;
    }
    if (copiedImageUrls.length > 0) {
      updateData.image_urls = copiedImageUrls;
    }

    if (Object.keys(updateData).length === 0) continue;

    const { error: updateError } = await client
      .from('glossary_entries')
      .update(updateData)
      .eq('id', newEntryId)
      .eq('project_id', targetProjectId);

    if (updateError) {
      throw new Error(`Failed to update transferred glossary relations: ${updateError.message}`);
    }
  }

  return { added: toInsert.length, skipped };
}

/**
 * Copy selected chapters (and optionally glossary) from one project to the end of another.
 * Requires matching target language; source language may differ (multi-source workflow).
 */
async function copyChaptersBetweenProjects(
  targetProjectId: string,
  userId: string,
  token: string,
  options: {
    sourceProjectId: string;
    chapterIds: string[];
    includeGlossary?: boolean;
    allowSameProject?: boolean;
  }
): Promise<TransferChaptersResult | undefined> {
  validateToken(token);
  const client = createClientWithToken(token);
  const {
    sourceProjectId,
    chapterIds,
    includeGlossary = false,
    allowSameProject = false,
  } = options;
  const uniqueChapterIds = [...new Set(chapterIds)];

  if (!allowSameProject && sourceProjectId === targetProjectId) {
    throw createSameProjectError();
  }

  const [sourceProjectRow, targetProjectRow] = await Promise.all([
    client
      .from('projects')
      .select('id, source_language, target_language')
      .eq('id', sourceProjectId)
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('projects')
      .select('id, source_language, target_language')
      .eq('id', targetProjectId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (!sourceProjectRow.data || !targetProjectRow.data) {
    return undefined;
  }

  if (!allowSameProject) {
    const sourceTargetLanguage = (sourceProjectRow.data.target_language as string) || 'ru';
    const targetTargetLanguage = (targetProjectRow.data.target_language as string) || 'ru';
    if (sourceTargetLanguage !== targetTargetLanguage) {
      throw createTargetLanguageMismatchError();
    }
  }

  const { data: sourceChapterRows, error: chaptersError } = await client
    .from('chapters')
    .select('*')
    .eq('project_id', sourceProjectId)
    .in('id', uniqueChapterIds);

  if (chaptersError) {
    throw new Error(`Failed to load source chapters: ${chaptersError.message}`);
  }

  if (!sourceChapterRows || sourceChapterRows.length !== uniqueChapterIds.length) {
    throw createInvalidChapterIdsError();
  }

  const sortedSourceChapters = [...sourceChapterRows].sort(
    (a, b) => (a.number as number) - (b.number as number)
  );

  const paragraphsByChapterId = await loadParagraphsForChapterIds(
    client,
    sortedSourceChapters.map((c) => c.id as string)
  );

  const expectedParagraphCount = sortedSourceChapters.reduce(
    (sum, chapter) => sum + (paragraphsByChapterId.get(chapter.id as string)?.length ?? 0),
    0
  );

  const { data: targetChapterNumbers, error: targetNumbersError } = await client
    .from('chapters')
    .select('number')
    .eq('project_id', targetProjectId)
    .order('number', { ascending: false })
    .limit(1);

  if (targetNumbersError) {
    throw new Error(`Failed to load target chapter numbers: ${targetNumbersError.message}`);
  }

  let nextNumber = (targetChapterNumbers?.[0]?.number as number | undefined) ?? 0;
  const chapterNumberMap = new Map<number, number>();
  const insertedChapterIds: string[] = [];

  try {
    for (const chapterRow of sortedSourceChapters) {
      const oldNumber = chapterRow.number as number;
      nextNumber += 1;
      chapterNumberMap.set(oldNumber, nextNumber);

      const paragraphs = paragraphsByChapterId.get(chapterRow.id as string) ?? [];
      const { data: newChapter, error: chapterError } = await client
        .from('chapters')
        .insert({
          project_id: targetProjectId,
          number: nextNumber,
          title: chapterRow.title,
          translated_title: chapterRow.translated_title ?? null,
          original_text: chapterRow.original_text,
          translated_text: chapterRow.translated_text ?? null,
          translated_chunks: chapterRow.translated_chunks ?? null,
          status: chapterRow.status,
          translation_meta: chapterRow.translation_meta ?? null,
          critic_report: chapterRow.critic_report ?? null,
        })
        .select('id')
        .single();

      if (chapterError || !newChapter) {
        throw new Error(`Failed to transfer chapter: ${chapterError?.message ?? 'unknown'}`);
      }

      insertedChapterIds.push(newChapter.id as string);

      if (paragraphs.length > 0) {
        const paragraphRows = paragraphs.map((p) => ({
          chapter_id: newChapter.id,
          index: p.index,
          original_text: p.originalText,
          translated_text: p.translatedText ?? null,
          status: p.status,
          edited_at: p.editedAt ?? null,
          edited_by: p.editedBy ?? null,
        }));
        await insertCloneParagraphRows(client, paragraphRows);
      }
    }

    const actualParagraphCount = await countParagraphsForChapterIds(client, insertedChapterIds);
    if (actualParagraphCount !== expectedParagraphCount) {
      throw createTransferIncompleteError(expectedParagraphCount, actualParagraphCount);
    }

    let glossaryAdded = 0;
    let glossarySkipped = 0;

    if (includeGlossary) {
      const [sourceGlossary, targetGlossary] = await Promise.all([
        loadGlossaryForProject(sourceProjectId, token),
        loadGlossaryForProject(targetProjectId, token),
      ]);
      const glossaryResult = await appendGlossaryFromSource(
        client,
        sourceGlossary,
        targetProjectId,
        targetGlossary,
        chapterNumberMap
      );
      glossaryAdded = glossaryResult.added;
      glossarySkipped = glossaryResult.skipped;
    }

    await client.from('projects').update({}).eq('id', targetProjectId);

    const chapterNumberMapRecord: Record<number, number> = {};
    for (const [oldNum, newNum] of chapterNumberMap) {
      chapterNumberMapRecord[oldNum] = newNum;
    }

    logger.info(
      {
        event: allowSameProject ? 'chapters.duplicated' : 'chapters.transferred',
        sourceProjectId,
        targetProjectId,
        chapters: sortedSourceChapters.length,
        paragraphs: expectedParagraphCount,
        glossaryAdded,
        glossarySkipped,
      },
      allowSameProject
        ? `Chapters duplicated in project ${targetProjectId}`
        : `Chapters transferred: ${sourceProjectId} -> ${targetProjectId}`
    );

    return {
      chaptersTransferred: sortedSourceChapters.length,
      glossaryAdded,
      glossarySkipped,
      chapterNumberMap: chapterNumberMapRecord,
    };
  } catch (error) {
    if (insertedChapterIds.length > 0) {
      await rollbackInsertedChapters(client, targetProjectId, insertedChapterIds);
    }
    throw error;
  }
}

export async function transferChaptersFromProject(
  targetProjectId: string,
  userId: string,
  token: string,
  options: {
    sourceProjectId: string;
    chapterIds: string[];
    includeGlossary?: boolean;
  }
): Promise<TransferChaptersResult | undefined> {
  return copyChaptersBetweenProjects(targetProjectId, userId, token, options);
}

/**
 * Duplicate selected chapters within a project (append copies at the end).
 */
export async function duplicateChaptersInProject(
  projectId: string,
  userId: string,
  token: string,
  chapterIds: string[]
): Promise<TransferChaptersResult | undefined> {
  return copyChaptersBetweenProjects(projectId, userId, token, {
    sourceProjectId: projectId,
    chapterIds,
    includeGlossary: false,
    allowSameProject: true,
  });
}

/**
 * Delete multiple chapters in one operation (renumber once at the end).
 */
export async function bulkDeleteChapters(
  projectId: string,
  chapterIds: string[],
  token: string
): Promise<number> {
  validateToken(token);
  const client = createClientWithToken(token);
  const uniqueIds = [...new Set(chapterIds)];

  const { data: chapters, error: loadError } = await client
    .from('chapters')
    .select('id')
    .eq('project_id', projectId)
    .in('id', uniqueIds);

  if (loadError) {
    throw new Error(`Failed to verify chapters: ${loadError.message}`);
  }

  if (!chapters || chapters.length !== uniqueIds.length) {
    throw createInvalidChapterIdsError();
  }

  const { error: deleteError } = await client
    .from('chapters')
    .delete()
    .eq('project_id', projectId)
    .in('id', uniqueIds);

  if (deleteError) {
    throw new Error(`Failed to delete chapters: ${deleteError.message}`);
  }

  await renumberChapters(projectId, token);
  await client.from('projects').update({}).eq('id', projectId);

  logger.info(
    { event: 'chapters.bulk_deleted', projectId, count: uniqueIds.length },
    `Bulk deleted ${uniqueIds.length} chapter(s)`
  );

  return uniqueIds.length;
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
 * Get chapter status and updated_at (lightweight, for status polling and orphan detection).
 * Returns null if chapter not found or user has no access (RLS).
 */
export async function getChapterStatusRow(
  projectId: string,
  chapterId: string,
  token: string
): Promise<{ status: string; updated_at: string } | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('chapters')
    .select('status, updated_at')
    .eq('id', chapterId)
    .eq('project_id', projectId)
    .single();

  if (error || !data) return null;
  return {
    status: (data.status as string) ?? 'pending',
    updated_at: (data.updated_at as string) ?? new Date().toISOString(),
  };
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

  const results: ChapterSummary[] = [];
  let offset = 0;

  for (;;) {
    const { data: rows, error } = await client.rpc('get_chapters_summary_batch', {
      p_project_id: projectId,
      p_offset: offset,
      p_limit: POSTGREST_MAX_ROWS,
    });

    if (error) throw new Error(`Failed to get chapters: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const ch of rows as Array<{
      id: string;
      number: number;
      title: string;
      translated_title?: string | null;
      status: string;
      translation_meta: unknown;
      paragraph_count: number;
      translated_paragraph_count: number;
    }>) {
      const meta = ch.translation_meta as Chapter['translationMeta'] | undefined;
      const paragraphCount = Number(ch.paragraph_count ?? 0);
      const translatedParagraphCount = Number(ch.translated_paragraph_count ?? 0);
      const status = ch.status as ChapterStatus;
      const hasTranslation =
        status === 'completed' ||
        status === 'draft' ||
        status === 'partial' ||
        (translatedParagraphCount > 0 && status !== 'error');
      const isFullyTranslated =
        paragraphCount > 0 &&
        translatedParagraphCount >= paragraphCount &&
        status !== 'partial' &&
        status !== 'error' &&
        (status === 'completed' || translatedParagraphCount >= paragraphCount);
      results.push({
        id: ch.id,
        number: ch.number,
        title: ch.title,
        translatedTitle: ch.translated_title?.trim() || undefined,
        status,
        hasTranslation,
        isFullyTranslated,
        hasOriginalText: paragraphCount > 0,
        paragraphCount,
        translatedParagraphCount,
        lastAnalysisAt: meta?.lastAnalysisAt,
      });
    }

    if (rows.length < POSTGREST_MAX_ROWS) break;
    offset += POSTGREST_MAX_ROWS;
  }

  return results;
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
    role?: UserRole;
    metadata?: ProjectMetadata;
  },
  userId: string,
  token: string
): Promise<Project> {
  validateToken(token);
  const client = createClientWithToken(token);
  const role = data.role ?? 'author';

  await assertCanAddProject(userId, role, token);

  const projectData: Record<string, unknown> = {
    user_id: userId,
    name: data.name || 'Новый проект',
    type: 'text',
    source_language: data.sourceLanguage || 'en',
    target_language: data.targetLanguage || 'ru',
    settings: getDefaultProjectSettings(role),
  };

  if (data.metadata !== undefined) {
    projectData.metadata = data.metadata;
  }

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
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 * @throws {Error} If token is required but not provided
 */
export async function updateProject(
  id: string,
  updates: Partial<Project>,
  userId: string,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<ProjectWithChapterList | undefined> {
  const useServiceRole = options?.useServiceRole === true;
  if (!useServiceRole) {
    validateToken(token);
  }
  const client = useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

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

  // Reload full project with relations (skip when useServiceRole - caller typically doesn't need it)
  if (useServiceRole) return undefined;
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

/**
 * Reset stuck chapters for job recovery (service role).
 * When chapterIds is provided, resets those chapters from 'translating' to 'pending' without 30 min timeout.
 * When chapterIds is omitted, uses same logic as resetStuckChapters (30 min timeout) with service role.
 */
export async function resetStuckChaptersForRecovery(
  projectId: string,
  chapterIds?: string[]
): Promise<number> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const STUCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes (used when chapterIds not provided)

  let chaptersToReset: string[] = [];

  if (chapterIds && chapterIds.length > 0) {
    // Force reset specified chapters without timeout check
    const { data: chapters, error } = await client
      .from('chapters')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'translating')
      .in('id', chapterIds);

    if (error) {
      throw new Error(`Failed to get stuck chapters for recovery: ${error.message}`);
    }
    chaptersToReset = (chapters ?? []).map((c) => c.id);
  } else {
    // Same logic as resetStuckChapters but with service role
    const { data: chapters, error } = await client
      .from('chapters')
      .select('id, translation_meta, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'translating');

    if (error) {
      throw new Error(`Failed to get stuck chapters: ${error.message}`);
    }

    if (!chapters || chapters.length === 0) {
      return 0;
    }

    const now = Date.now();
    for (const chapter of chapters) {
      let isStuck = false;
      const translatedAtStr = (chapter.translation_meta as { translatedAt?: string } | undefined)
        ?.translatedAt;
      if (translatedAtStr) {
        const translatedAt = new Date(translatedAtStr).getTime();
        isStuck = now - translatedAt > STUCK_TIMEOUT;
      } else {
        const updatedAt = chapter.updated_at != null ? new Date(chapter.updated_at).getTime() : now;
        isStuck = now - updatedAt > STUCK_TIMEOUT;
      }
      if (isStuck) {
        chaptersToReset.push(chapter.id);
      }
    }
  }

  if (chaptersToReset.length === 0) {
    return 0;
  }

  const { error: updateError } = await client
    .from('chapters')
    .update({ status: 'pending' })
    .in('id', chaptersToReset);

  if (updateError) {
    throw new Error(`Failed to reset stuck chapters: ${updateError.message}`);
  }

  return chaptersToReset.length;
}

/**
 * Load chapters by IDs with full content (paragraphs) using service role.
 * Used for job recovery when worker needs to load specific chapters.
 */
async function loadChaptersByIdsWithServiceRole(
  projectId: string,
  chapterIds: string[]
): Promise<Chapter[]> {
  if (chapterIds.length === 0) return [];

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: chapters, error } = await client
    .from('chapters')
    .select('*, paragraphs(*)')
    .eq('project_id', projectId)
    .in('id', chapterIds)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load chapters for recovery: ${error.message}`);
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
 * Get project with full chapters for job recovery (service role).
 * Verifies project belongs to user, loads specified chapters with text.
 */
export async function getProjectFullForRecovery(
  projectId: string,
  userId: string,
  chapterIds: string[]
): Promise<Project | null> {
  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const client = createServiceRoleClient();

    const { data: project, error } = await client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error || !project) {
      return null;
    }

    const [chapters, glossary] = await Promise.all([
      loadChaptersByIdsWithServiceRole(projectId, chapterIds),
      loadGlossaryForProjectPublic(projectId),
    ]);

    return transformProjectFromDB(project, chapters, glossary);
  } catch (err) {
    logger.warn({ err, projectId }, 'getProjectFullForRecovery failed');
    return null;
  }
}
