/**
 * Extracted from supabaseDatabase.ts
 */

import { logger } from '../../../logger.js';
import { getPublicationByProjectId, getPublicationById } from './publications.js';

export interface TranslationReportRow {
  id: string;
  publicationId: string;
  chapterId: string;
  chapterNumber?: number;
  chapterTitle?: string;
  description: string;
  reporterUserId: string | null;
  status: string;
  createdAt: string;
}

/**
 * Create a translation report (complaint). Public endpoint - no auth required.
 * Validates: publication exists and is published; chapter belongs to publication's project.
 */
export async function createTranslationReport(data: {
  publicationId: string;
  chapterId: string;
  description: string;
  reporterUserId?: string | null;
  reporterIpHash?: string | null;
}): Promise<{ id: string }> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const pub = await getPublicationById(data.publicationId);
  if (!pub) {
    throw new Error('Publication not found or not published');
  }

  // Verify chapter belongs to publication's project
  const { data: chapter, error: chapterError } = await client
    .from('chapters')
    .select('id, number, title')
    .eq('id', data.chapterId)
    .eq('project_id', pub.projectId)
    .single();

  if (chapterError || !chapter) {
    throw new Error('Chapter not found or does not belong to this publication');
  }

  const desc = String(data.description || '').trim();
  if (desc.length < 5) {
    throw new Error('Description must be at least 5 characters');
  }
  if (desc.length > 5000) {
    throw new Error('Description must not exceed 5000 characters');
  }

  // No rate limit for authenticated users — spammers can be banned. Auth is required.
  const { data: inserted, error } = await client
    .from('translation_reports')
    .insert({
      publication_id: data.publicationId,
      chapter_id: data.chapterId,
      description: desc,
      reporter_user_id: data.reporterUserId ?? null,
      reporter_ip_hash: data.reporterIpHash ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create translation report: ${error.message}`);
  }

  return { id: inserted.id };
}

/**
 * Get translation reports count for a project (owner only).
 * Uses publication linked to project; returns 0 if no publication.
 */
export async function getTranslationReportsCountByProject(
  projectId: string,
  userId: string,
  token: string
): Promise<number> {
  const pub = await getPublicationByProjectId(projectId, userId, token);
  if (!pub) return 0;

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { count, error } = await client
    .from('translation_reports')
    .select('*', { count: 'exact', head: true })
    .eq('publication_id', pub.id)
    .eq('status', 'pending');

  if (error) {
    logger.warn({ err: error, projectId }, 'Failed to get translation reports count');
    return 0;
  }
  return count ?? 0;
}

export type TranslationReportStatus = 'pending' | 'reviewed' | 'resolved';

/**
 * Update translation report status (owner only).
 * Verifies report belongs to project's publication.
 */
export async function updateTranslationReportStatus(
  projectId: string,
  reportId: string,
  userId: string,
  token: string,
  status: TranslationReportStatus
): Promise<void> {
  const pub = await getPublicationByProjectId(projectId, userId, token);
  if (!pub) {
    throw new Error('Project or publication not found');
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: report, error: fetchError } = await client
    .from('translation_reports')
    .select('id')
    .eq('id', reportId)
    .eq('publication_id', pub.id)
    .single();

  if (fetchError || !report) {
    throw new Error('Report not found or access denied');
  }

  const { error: updateError } = await client
    .from('translation_reports')
    .update({ status })
    .eq('id', reportId)
    .eq('publication_id', pub.id);

  if (updateError) {
    throw new Error(`Failed to update report status: ${updateError.message}`);
  }
}

/**
 * Delete translation report (owner only).
 * Verifies report belongs to project's publication.
 */
export async function deleteTranslationReport(
  projectId: string,
  reportId: string,
  userId: string,
  token: string
): Promise<void> {
  const pub = await getPublicationByProjectId(projectId, userId, token);
  if (!pub) {
    throw new Error('Project or publication not found');
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: report, error: fetchError } = await client
    .from('translation_reports')
    .select('id')
    .eq('id', reportId)
    .eq('publication_id', pub.id)
    .single();

  if (fetchError || !report) {
    throw new Error('Report not found or access denied');
  }

  const { error: deleteError } = await client
    .from('translation_reports')
    .delete()
    .eq('id', reportId)
    .eq('publication_id', pub.id);

  if (deleteError) {
    throw new Error(`Failed to delete report: ${deleteError.message}`);
  }
}

/**
 * Get translation reports for a project (owner only).
 * Returns reports with chapter info for the publication.
 */
export async function getTranslationReportsByProject(
  projectId: string,
  userId: string,
  token: string
): Promise<TranslationReportRow[]> {
  const pub = await getPublicationByProjectId(projectId, userId, token);
  if (!pub) return [];

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: rows, error } = await client
    .from('translation_reports')
    .select('id, publication_id, chapter_id, description, reporter_user_id, status, created_at')
    .eq('publication_id', pub.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.warn({ err: error, projectId }, 'Failed to get translation reports');
    return [];
  }

  if (!rows || rows.length === 0) return [];

  // Enrich with chapter number/title
  const chapterIds = [...new Set(rows.map((r) => r.chapter_id))];
  const { data: chapters } = await client
    .from('chapters')
    .select('id, number, title')
    .in('id', chapterIds);

  const chapterMap = new Map(
    (chapters || []).map((c) => [c.id, { number: c.number, title: c.title }])
  );

  return rows.map((r) => ({
    id: r.id,
    publicationId: r.publication_id,
    chapterId: r.chapter_id,
    chapterNumber: chapterMap.get(r.chapter_id)?.number,
    chapterTitle: chapterMap.get(r.chapter_id)?.title,
    description: r.description,
    reporterUserId: r.reporter_user_id,
    status: r.status,
    createdAt: r.created_at,
  }));
}
