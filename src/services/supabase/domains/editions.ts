import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientWithToken, createServiceRoleClient } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import { isSupportedPair } from '../../../engine/language.js';
import type { Language } from '../../../engine/types/common.js';
import type { Chapter, Paragraph } from '../../../storage/database.js';
import {
  isMissingRelationError,
  type ChapterEditionState,
} from '../../editions/editionLanguage.js';
import { logger } from '../../../logger.js';

export interface PublicationEditionRow {
  language: string;
  translationStatus: string | null;
}

async function clientFor(token: string, useServiceRole?: boolean): Promise<SupabaseClient> {
  if (useServiceRole) {
    return createServiceRoleClient();
  }
  validateToken(token);
  return createClientWithToken(token);
}

export async function listProjectEditionLanguages(
  projectId: string,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<string[]> {
  const client = await clientFor(token, options?.useServiceRole);
  const { data, error } = await client
    .from('project_editions')
    .select('target_language')
    .eq('project_id', projectId);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(`Failed to list editions: ${error.message}`);
  }
  return (data ?? []).map((row) => row.target_language as string);
}

export async function createProjectEdition(
  projectId: string,
  targetLanguage: string,
  token: string
): Promise<{ targetLanguage: string }> {
  validateToken(token);
  const client = createClientWithToken(token);
  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id, source_language, target_language')
    .eq('id', projectId)
    .single();
  if (projectError || !project) {
    throw new Error('Project not found');
  }
  const source = (project.source_language as string) || 'en';
  const primary = (project.target_language as string) || 'ru';
  if (targetLanguage === primary) {
    throw new Error('Edition language matches the primary target');
  }
  if (!isSupportedPair(source as Language, targetLanguage as Language)) {
    throw new Error('Unsupported translation language pair');
  }
  const { error } = await client.from('project_editions').insert({
    project_id: projectId,
    target_language: targetLanguage,
  });
  if (error) {
    if (error.code === '23505') return { targetLanguage };
    throw new Error(`Failed to create edition: ${error.message}`);
  }
  return { targetLanguage };
}

export async function listChapterEditionStates(
  projectId: string,
  targetLanguage: string,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<Map<string, ChapterEditionState>> {
  const client = await clientFor(token, options?.useServiceRole);
  const { data: chapters, error: chapterError } = await client
    .from('chapters')
    .select('id')
    .eq('project_id', projectId);
  if (chapterError) throw new Error(`Failed to list chapters: ${chapterError.message}`);
  const chapterIds = (chapters ?? []).map((row) => row.id as string);
  const map = new Map<string, ChapterEditionState>();
  if (chapterIds.length === 0) return map;

  const { data, error } = await client
    .from('chapter_editions')
    .select('chapter_id, status, translated_title')
    .eq('target_language', targetLanguage)
    .in('chapter_id', chapterIds);
  if (error) {
    if (isMissingRelationError(error)) return map;
    throw new Error(`Failed to list chapter editions: ${error.message}`);
  }
  for (const row of data ?? []) {
    const status = row.status as Chapter['status'];
    map.set(row.chapter_id as string, {
      status,
      translatedTitle: (row.translated_title as string | null)?.trim() || undefined,
      hasTranslation: status === 'draft' || status === 'partial' || status === 'completed',
    });
  }
  return map;
}

export async function chapterHasTranslatingLock(
  chapterId: string,
  token: string,
  options?: { useServiceRole?: boolean; chapterStatus?: string }
): Promise<boolean> {
  const client = await clientFor(token, options?.useServiceRole);
  const { data: chapterRow, error: chapterError } = await client
    .from('chapters')
    .select('status')
    .eq('id', chapterId)
    .maybeSingle();
  if (chapterError) throw new Error(`Failed to read chapter lock: ${chapterError.message}`);
  if (chapterRow?.status === 'translating' || options?.chapterStatus === 'translating') return true;
  const { data, error } = await client
    .from('chapter_editions')
    .select('status')
    .eq('chapter_id', chapterId)
    .eq('status', 'translating')
    .limit(1);
  if (error) {
    if (isMissingRelationError(error)) return false;
    throw new Error(`Failed to read edition lock: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

export async function upsertChapterEdition(
  client: SupabaseClient,
  chapterId: string,
  targetLanguage: string,
  fields: {
    status?: string;
    translatedTitle?: string | null;
    translationMeta?: unknown;
  }
): Promise<void> {
  const row: Record<string, unknown> = {
    chapter_id: chapterId,
    target_language: targetLanguage,
    updated_at: new Date().toISOString(),
  };
  if (fields.status !== undefined) row.status = fields.status;
  if (fields.translatedTitle !== undefined) row.translated_title = fields.translatedTitle;
  if (fields.translationMeta !== undefined) row.translation_meta = fields.translationMeta;
  const { error } = await client.from('chapter_editions').upsert(row, {
    onConflict: 'chapter_id,target_language',
  });
  if (error) throw new Error(`Failed to save chapter edition: ${error.message}`);
}

export async function upsertParagraphTranslations(
  client: SupabaseClient,
  targetLanguage: string,
  paragraphs: Paragraph[]
): Promise<void> {
  if (paragraphs.length === 0) return;
  const rows = paragraphs.map((paragraph) => ({
    paragraph_id: paragraph.id,
    target_language: targetLanguage,
    translated_text: paragraph.translatedText || null,
    status: paragraph.status ?? 'pending',
    edited_at: paragraph.editedAt || null,
    edited_by: paragraph.editedBy || null,
  }));
  const { error } = await client.from('paragraph_translations').upsert(rows, {
    onConflict: 'paragraph_id,target_language',
  });
  if (error) throw new Error(`Failed to save paragraph translations: ${error.message}`);
}

export async function loadParagraphTranslations(
  client: SupabaseClient,
  paragraphIds: string[],
  targetLanguage: string
): Promise<Map<string, Pick<Paragraph, 'translatedText' | 'status'>>> {
  const map = new Map<string, Pick<Paragraph, 'translatedText' | 'status'>>();
  if (paragraphIds.length === 0) return map;
  const { data, error } = await client
    .from('paragraph_translations')
    .select('paragraph_id, translated_text, status')
    .eq('target_language', targetLanguage)
    .in('paragraph_id', paragraphIds);
  if (error) {
    if (isMissingRelationError(error)) return map;
    throw new Error(`Failed to load paragraph translations: ${error.message}`);
  }
  for (const row of data ?? []) {
    map.set(row.paragraph_id as string, {
      translatedText: (row.translated_text as string | null) || undefined,
      status: (row.status as Paragraph['status']) || 'pending',
    });
  }
  return map;
}

export async function loadChapterEditionRow(
  client: SupabaseClient,
  chapterId: string,
  targetLanguage: string
): Promise<{ status: Chapter['status']; translatedTitle?: string } | null> {
  const { data, error } = await client
    .from('chapter_editions')
    .select('status, translated_title')
    .eq('chapter_id', chapterId)
    .eq('target_language', targetLanguage)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw new Error(`Failed to load chapter edition: ${error.message}`);
  }
  if (!data) return null;
  return {
    status: data.status as Chapter['status'],
    translatedTitle: (data.translated_title as string | null)?.trim() || undefined,
  };
}

export async function listPublicationEditions(
  publicationIds: string[]
): Promise<Map<string, PublicationEditionRow[]>> {
  const map = new Map<string, PublicationEditionRow[]>();
  if (publicationIds.length === 0) return map;
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from('publication_editions')
    .select('publication_id, target_language, translation_status')
    .in('publication_id', publicationIds);
  if (error) {
    if (isMissingRelationError(error)) return map;
    logger.warn({ err: error }, 'Failed to list publication editions');
    return map;
  }
  for (const row of data ?? []) {
    const id = row.publication_id as string;
    const list = map.get(id) ?? [];
    list.push({
      language: row.target_language as string,
      translationStatus: (row.translation_status as string | null) ?? null,
    });
    map.set(id, list);
  }
  return map;
}

export async function editionChapterTranslatedText(
  chapterId: string,
  targetLanguage: string
): Promise<string> {
  const client = createServiceRoleClient();
  const { data: paragraphs, error } = await client
    .from('paragraphs')
    .select('id, index')
    .eq('chapter_id', chapterId)
    .order('index', { ascending: true });
  if (error || !paragraphs?.length) return '';
  const ids = paragraphs.map((row) => row.id as string);
  const translations = await loadParagraphTranslations(client, ids, targetLanguage);
  return paragraphs
    .map((row) => translations.get(row.id as string)?.translatedText?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join('\n\n');
}
