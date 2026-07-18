/**
 * Extracted from supabaseDatabase.ts
 */

import { supabase, createClientWithToken } from '../../supabaseClient.js';
import { POSTGREST_MAX_ROWS } from '../../../shared/cacheContract.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import { titleToSlug } from '../../../utils/slug.js';
import { chapterDisplayTitle } from '../../../shared/chapterTitle.js';
import {
  createInvalidTranslatorPseudonymError,
  createPseudonymLimitError,
  isOwnedActiveTranslatorPseudonym,
  MAX_TRANSLATOR_PSEUDONYMS_PER_USER,
} from '../../../shared/translatorPseudonyms.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicEntity, PublicEntityKind, GlossaryEntry } from '../../../storage/database.js';
import {
  translationStatusFromMetadata,
  type TranslationStatus,
} from '../../../shared/translation-status.js';
import {
  transformPublicationFromDB,
  transformPublicEntityFromDB,
  type PublicationRow,
  type PublicationStatus,
  type PublicationListRow,
  type PublicEntityRow,
} from '../transforms/publication.js';
import { getGlossaryCountForProject, loadGlossaryForProjectPublic } from '../loaders.js';

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

export async function createPublicEntity(
  data: {
    kind: PublicEntityKind;
    name: string;
    description?: string;
    photoUrl?: string | null;
    createdBy?: string;
  },
  token: string
): Promise<PublicEntity> {
  validateToken(token);
  const client = createClientWithToken(token);

  const payload = {
    kind: data.kind,
    name: data.name.trim(),
    description: data.description?.trim() || null,
    photo_url: data.photoUrl ?? null,
    created_by: data.createdBy ?? null,
    status: 'active',
  };

  const { data: row, error } = await client
    .from('public_entities')
    .insert(payload)
    .select('*')
    .single();

  if (error || !row) {
    throw new Error(`Failed to create public entity: ${error?.message || 'Unknown error'}`);
  }

  return transformPublicEntityFromDB(row as PublicEntityRow);
}

export async function listPublicEntities(options?: {
  kind?: PublicEntityKind;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PublicEntity[]> {
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('public_entities')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.kind) {
    query = query.eq('kind', options.kind);
  }

  if (options?.search?.trim()) {
    query = query.ilike('name', `%${options.search.trim()}%`);
  }

  query = query.eq('status', 'active');

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list public entities: ${error.message}`);
  }

  return (data || []).map((row) => transformPublicEntityFromDB(row as PublicEntityRow));
}

export async function getPublicEntityById(id: string): Promise<PublicEntity | null> {
  const { data, error } = await supabase
    .from('public_entities')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get public entity: ${error.message}`);
  }
  if (!data) return null;
  return transformPublicEntityFromDB(data as PublicEntityRow);
}

export async function updatePublicEntity(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    photoUrl?: string | null;
  },
  token: string
): Promise<PublicEntity> {
  validateToken(token);
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.description !== undefined) payload.description = data.description?.trim() || null;
  if (data.photoUrl !== undefined) payload.photo_url = data.photoUrl;

  const { data: row, error } = await client
    .from('public_entities')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update public entity: ${error.message}`);
  }
  if (!row) {
    throw new Error('Failed to update public entity: entity not found or no rows updated');
  }

  return transformPublicEntityFromDB(row as PublicEntityRow);
}

export async function deletePublicEntity(id: string, token: string): Promise<void> {
  validateToken(token);
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { error } = await client.from('public_entities').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete public entity: ${error.message}`);
  }
}

export async function countActiveTranslatorPseudonymsForUser(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('public_entities')
    .select('*', { count: 'exact', head: true })
    .eq('kind', 'translator')
    .eq('owner_user_id', userId)
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to count translator pseudonyms: ${error.message}`);
  }
  return count ?? 0;
}

export async function listTranslatorPseudonymsForUser(
  userId: string,
  options?: { includeHidden?: boolean }
): Promise<PublicEntity[]> {
  let query = supabase
    .from('public_entities')
    .select('*')
    .eq('kind', 'translator')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true });

  if (!options?.includeHidden) {
    query = query.eq('status', 'active');
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list translator pseudonyms: ${error.message}`);
  }

  return (data || []).map((row) => transformPublicEntityFromDB(row as PublicEntityRow));
}

export async function getTranslatorPseudonymForUser(
  userId: string,
  entityId: string
): Promise<PublicEntity | null> {
  const { data, error } = await supabase
    .from('public_entities')
    .select('*')
    .eq('id', entityId)
    .eq('kind', 'translator')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get translator pseudonym: ${error.message}`);
  }
  if (!data) return null;
  return transformPublicEntityFromDB(data as PublicEntityRow);
}

export async function assertOwnedActiveTranslatorPseudonym(
  userId: string,
  entityId: string
): Promise<PublicEntity> {
  const entity = await getPublicEntityById(entityId);
  if (!isOwnedActiveTranslatorPseudonym(entity, userId)) {
    throw createInvalidTranslatorPseudonymError();
  }
  return entity!;
}

export async function createTranslatorPseudonymForUser(
  userId: string,
  data: {
    name: string;
    description?: string;
    photoUrl?: string | null;
  },
  token: string
): Promise<PublicEntity> {
  validateToken(token);
  const activeCount = await countActiveTranslatorPseudonymsForUser(userId);
  if (activeCount >= MAX_TRANSLATOR_PSEUDONYMS_PER_USER) {
    throw createPseudonymLimitError(activeCount);
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const payload = {
    kind: 'translator' as const,
    name: data.name.trim(),
    description: data.description?.trim() || null,
    photo_url: data.photoUrl ?? null,
    created_by: userId,
    owner_user_id: userId,
    status: 'active',
  };

  const { data: row, error } = await client
    .from('public_entities')
    .insert(payload)
    .select('*')
    .single();

  if (error || !row) {
    throw new Error(`Failed to create translator pseudonym: ${error?.message || 'Unknown error'}`);
  }

  return transformPublicEntityFromDB(row as PublicEntityRow);
}

export async function updateTranslatorPseudonymForUser(
  userId: string,
  entityId: string,
  data: {
    name?: string;
    description?: string | null;
    photoUrl?: string | null;
  }
): Promise<PublicEntity> {
  const existing = await getTranslatorPseudonymForUser(userId, entityId);
  if (!existing) {
    throw createInvalidTranslatorPseudonymError();
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.description !== undefined) payload.description = data.description?.trim() || null;
  if (data.photoUrl !== undefined) payload.photo_url = data.photoUrl;

  const { data: row, error } = await client
    .from('public_entities')
    .update(payload)
    .eq('id', entityId)
    .eq('owner_user_id', userId)
    .eq('kind', 'translator')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update translator pseudonym: ${error.message}`);
  }
  if (!row) {
    throw createInvalidTranslatorPseudonymError();
  }

  return transformPublicEntityFromDB(row as PublicEntityRow);
}

export async function hideTranslatorPseudonymForUser(
  userId: string,
  entityId: string
): Promise<PublicEntity> {
  const existing = await getTranslatorPseudonymForUser(userId, entityId);
  if (!existing) {
    throw createInvalidTranslatorPseudonymError();
  }

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: row, error } = await client
    .from('public_entities')
    .update({
      status: 'blocked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)
    .eq('owner_user_id', userId)
    .eq('kind', 'translator')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to hide translator pseudonym: ${error.message}`);
  }
  if (!row) {
    throw createInvalidTranslatorPseudonymError();
  }

  return transformPublicEntityFromDB(row as PublicEntityRow);
}

/**
 * Count publications that reference this entity (as author, translator, or tag).
 */
export async function countPublicationsUsingEntity(entityId: string): Promise<number> {
  const { count, error } = await supabase
    .from('publications')
    .select('*', { count: 'exact', head: true })
    .or(
      `author_entity_id.eq.${entityId},translator_entity_id.eq.${entityId},tag_entity_ids.cs.{"${entityId}"}`
    );

  if (error) {
    throw new Error(`Failed to count entity usage: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * List published publications (public, no auth).
 * Uses anon client - RLS allows SELECT where status = 'published'.
 */
export async function listPublicationsPublic(options?: {
  limit?: number;
  offset?: number;
  orderBy?: 'published_at' | 'created_at' | 'rating';
  orderAsc?: boolean;
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityId?: string;
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
    translatedChapterCount: number;
    ratingAvg: number | null;
    ratingCount: number;
    ratingBayesian: number | null;
  }[]
> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const orderBy = options?.orderBy ?? 'published_at';
  const orderAsc = options?.orderAsc ?? false;
  const authorEntityId = options?.authorEntityId;
  const translatorEntityId = options?.translatorEntityId;
  const tagEntityId = options?.tagEntityId;

  let query = supabase.from('publications_list_with_counts').select('*').eq('status', 'published');

  if (authorEntityId) {
    query = query.eq('author_entity_id', authorEntityId);
  }
  if (translatorEntityId) {
    query = query.eq('translator_entity_id', translatorEntityId);
  }
  if (tagEntityId) {
    query = query.contains('tag_entity_ids', [tagEntityId]);
  }

  if (orderBy === 'rating') {
    query = query
      .order('rating_bayesian', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order(orderBy === 'published_at' ? 'published_at' : 'created_at', {
      ascending: orderAsc,
      nullsFirst: false,
    });
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    // Fallback if view unavailable or anon cannot EXECUTE SECURITY DEFINER helpers in view
    if (
      error.message?.includes('relation') ||
      error.message?.includes('does not exist') ||
      error.message?.includes('permission denied for function')
    ) {
      return listPublicationsPublicFallback({
        limit,
        offset,
        orderBy,
        orderAsc,
        authorEntityId,
        translatorEntityId,
        tagEntityId,
      });
    }
    throw new Error(`Failed to list publications: ${error.message}`);
  }

  return (data || []).map((row: PublicationListRow) => ({
    ...transformPublicationFromDB(row),
    translatedChapterCount: row.translated_chapter_count ?? 0,
  }));
}

/** Fallback when publications_list_with_counts view is not yet created. */
async function listPublicationsPublicFallback(options: {
  limit?: number;
  offset?: number;
  orderBy?: 'published_at' | 'created_at' | 'rating';
  orderAsc?: boolean;
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityId?: string;
}): Promise<
  Array<ReturnType<typeof transformPublicationFromDB> & { translatedChapterCount: number }>
> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const orderBy = options.orderBy ?? 'published_at';
  const orderAsc = options.orderAsc ?? false;

  let query = supabase.from('publications').select('*').eq('status', 'published');
  if (options.authorEntityId) query = query.eq('author_entity_id', options.authorEntityId);
  if (options.translatorEntityId)
    query = query.eq('translator_entity_id', options.translatorEntityId);
  if (options.tagEntityId) query = query.contains('tag_entity_ids', [options.tagEntityId]);

  let rows: PublicationRow[];
  if (options.orderBy === 'rating') {
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list publications: ${error.message}`);
    rows = [...((data || []) as PublicationRow[])].sort((a, b) => {
      const ba = a.rating_bayesian != null ? Number(a.rating_bayesian) : -1;
      const bb = b.rating_bayesian != null ? Number(b.rating_bayesian) : -1;
      if (bb !== ba) return bb - ba;
      const pa = a.published_at ? new Date(a.published_at).getTime() : 0;
      const pb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return pb - pa;
    });
    rows = rows.slice(offset, offset + limit);
  } else {
    const { data, error } = await query
      .order(orderBy === 'published_at' ? 'published_at' : 'created_at', {
        ascending: orderAsc,
        nullsFirst: false,
      })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to list publications: ${error.message}`);
    rows = (data || []) as PublicationRow[];
  }

  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const translatedCounts: Record<string, number> = {};

  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const client = createServiceRoleClient();
    const { data: counts } = await client.rpc('get_chapter_counts_by_projects', {
      p_project_ids: projectIds,
    });
    for (const row of counts || []) {
      const r = row as { project_id: string; translated_count?: number };
      translatedCounts[r.project_id] = Number(r.translated_count ?? 0);
    }
  } catch {
    // Service role or RPC unavailable
  }

  return rows.map((row) => ({
    ...transformPublicationFromDB(row),
    translatedChapterCount: translatedCounts[row.project_id] ?? 0,
  }));
}

/**
 * Get publication by slug or ID (public for published).
 * Tries slug first (if looks like slug: no hyphens in UUID pattern), then ID.
 */
export async function getPublicationBySlugOrId(
  slugOrId: string
): Promise<ReturnType<typeof transformPublicationFromDB> | null> {
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
export async function getPublicationById(
  publicationId: string
): Promise<ReturnType<typeof transformPublicationFromDB> | null> {
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

  // Load chapters for this project (chapters are under project owned by publication owner).
  // Use service role to read chapters for published project.
  // Pagination bypasses PostgREST 1000 row limit for publications with >1000 chapters.
  let list: Array<{ id: string; number: number; title: string; hasTranslation: boolean }> = [];
  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const allChapters: Array<{
      id: string;
      number: number;
      title: string;
      translated_title?: string | null;
    }> = [];
    const allTranslatedIds = new Set<string>();

    // Paginate chapters (ordered by number)
    let chapterOffset = 0;
    for (;;) {
      const chaptersResult = await serviceClient
        .from('chapters')
        .select('id, number, title, translated_title')
        .eq('project_id', pub.projectId)
        .order('number', { ascending: true })
        .range(chapterOffset, chapterOffset + POSTGREST_MAX_ROWS - 1);
      const chapters = chaptersResult.data || [];
      for (const c of chapters) {
        allChapters.push({
          id: c.id,
          number: c.number,
          title: c.title,
          translated_title: (c as { translated_title?: string | null }).translated_title,
        });
      }
      if (chapters.length < POSTGREST_MAX_ROWS) break;
      chapterOffset += POSTGREST_MAX_ROWS;
    }

    // Paginate translated chapter IDs (need all to build hasTranslation map)
    let translatedOffset = 0;
    for (;;) {
      const translatedResult = await serviceClient
        .from('chapters')
        .select('id')
        .eq('project_id', pub.projectId)
        .not('translated_text', 'is', null)
        .order('id', { ascending: true })
        .range(translatedOffset, translatedOffset + POSTGREST_MAX_ROWS - 1);
      const translated = translatedResult.data || [];
      for (const c of translated) {
        allTranslatedIds.add(c.id);
      }
      if (translated.length < POSTGREST_MAX_ROWS) break;
      translatedOffset += POSTGREST_MAX_ROWS;
    }

    list = allChapters.map((c) => ({
      id: c.id,
      number: c.number,
      title: chapterDisplayTitle({
        title: c.title,
        translatedTitle: c.translated_title,
        number: c.number,
      }),
      hasTranslation: allTranslatedIds.has(c.id),
    }));
  } catch {
    // Service role not configured: return publication without chapters (client can still show metadata)
  }

  let glossaryCount = 0;
  if (pub.showGlossary !== false) {
    try {
      glossaryCount = await getGlossaryCountForProject(pub.projectId);
    } catch {
      // Service role or glossary table issue: return 0 so client hides Glossary button
    }
  }

  return { publication: pub, chapters: list, glossaryCount };
}

/**
 * Get glossary for a published publication (public, no auth). Returns empty array if publication not found or not published.
 */
export async function getGlossaryForPublication(publicationId: string): Promise<GlossaryEntry[]> {
  const pub = await getPublicationById(publicationId);
  if (!pub) return [];
  return loadGlossaryForProjectPublic(pub.projectId);
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
    translated_title?: string | null;
    translated_text: string | null;
  } | null = null;
  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data, error } = await serviceClient
      .from('chapters')
      .select('id, number, title, translated_title, translated_text')
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
    title: chapterDisplayTitle({
      title: chapter.title,
      translatedTitle: chapter.translated_title,
      number: chapter.number,
    }),
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
    authorEntityId?: string | null;
    translatorEntityId?: string | null;
    tagEntityIds?: string[] | null;
    sourceLanguage?: string;
    targetLanguage?: string;
    translationStatus?: TranslationStatus | null;
    sourceUrl?: string | null;
  }
): Promise<ReturnType<typeof transformPublicationFromDB>> {
  validateToken(token);
  const client = createClientWithToken(token);

  // Ensure user owns the project
  const { getProject } = await import('./projects.js');
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

  const slug = title
    ? await ensureUniqueSlug(client, titleToSlug(title), existing?.id ?? null)
    : null;

  const translationStatus =
    data.translationStatus !== undefined
      ? data.translationStatus
      : translationStatusFromMetadata(project.metadata ?? null);

  const sourceUrl = data.sourceUrl ?? project.metadata?.sourceUrl ?? null;

  const row = {
    project_id: projectId,
    user_id: userId,
    status: data.status,
    title,
    description: data.description ?? project.metadata?.description ?? null,
    cover_image_url: data.coverImageUrl ?? project.metadata?.coverImageUrl ?? null,
    author_display: data.authorDisplay ?? undefined,
    translator_display: data.translatorDisplay ?? undefined,
    author_entity_id: data.authorEntityId ?? undefined,
    translator_entity_id: data.translatorEntityId ?? undefined,
    tag_entity_ids: data.tagEntityIds ?? undefined,
    source_language: data.sourceLanguage ?? project.sourceLanguage,
    target_language: data.targetLanguage ?? project.targetLanguage,
    published_at: isPublish ? now : null,
    updated_at: now,
    slug,
    source_url: sourceUrl,
  };

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      status: data.status,
      title: row.title,
      description: row.description,
      cover_image_url: row.cover_image_url,
      source_url: row.source_url,
      source_language: row.source_language,
      target_language: row.target_language,
      updated_at: row.updated_at,
      slug: slug ?? undefined,
    };
    if (data.authorDisplay !== undefined) updatePayload.author_display = data.authorDisplay;
    if (data.translatorDisplay !== undefined)
      updatePayload.translator_display = data.translatorDisplay;
    if (data.authorEntityId !== undefined) updatePayload.author_entity_id = data.authorEntityId;
    if (data.translatorEntityId !== undefined)
      updatePayload.translator_entity_id = data.translatorEntityId;
    if (data.tagEntityIds !== undefined) updatePayload.tag_entity_ids = data.tagEntityIds;
    updatePayload.translation_status = translationStatus;
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
    author_entity_id: data.authorEntityId ?? null,
    translator_entity_id: data.translatorEntityId ?? null,
    tag_entity_ids: data.tagEntityIds ?? [],
    translation_status: translationStatus,
    source_url: sourceUrl,
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
 * Update publication export storage paths (owner only).
 */
export async function updatePublicationExportPaths(
  publicationId: string,
  userId: string,
  token: string,
  data: { epubStoragePath?: string | null; fb2StoragePath?: string | null }
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.epubStoragePath !== undefined) updatePayload.epub_storage_path = data.epubStoragePath;
  if (data.fb2StoragePath !== undefined) updatePayload.fb2_storage_path = data.fb2StoragePath;

  const { error } = await client
    .from('publications')
    .update(updatePayload)
    .eq('id', publicationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update publication export paths: ${error.message}`);
  }
}

/**
 * Update publication display settings (owner only).
 * Used for showGlossary toggle.
 */
export async function updatePublicationDisplaySettings(
  publicationId: string,
  userId: string,
  token: string,
  data: { showGlossary?: boolean; translationStatus?: TranslationStatus | null }
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.showGlossary !== undefined) updatePayload.show_glossary = data.showGlossary;
  if (data.translationStatus !== undefined)
    updatePayload.translation_status = data.translationStatus;

  const { error } = await client
    .from('publications')
    .update(updatePayload)
    .eq('id', publicationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update publication display settings: ${error.message}`);
  }
}

/**
 * Sync translation_status on publication from project metadata (owner only).
 */
export async function syncPublicationTranslationStatus(
  projectId: string,
  userId: string,
  token: string,
  translationStatus: TranslationStatus | null
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client
    .from('publications')
    .update({
      translation_status: translationStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to sync publication translation status: ${error.message}`);
  }
}

/**
 * Get all publications for current user (any status).
 */
export async function getUserPublications(
  userId: string,
  token: string
): Promise<
  Array<ReturnType<typeof transformPublicationFromDB> & { translatedChapterCount?: number }>
> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications_list_with_counts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    // Fallback if view not yet migrated
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return getUserPublicationsFallback(userId, token);
    }
    throw new Error(`Failed to get user publications: ${error.message}`);
  }

  return (data || []).map((row: PublicationListRow) => ({
    ...transformPublicationFromDB(row),
    translatedChapterCount: row.translated_chapter_count ?? 0,
  }));
}

async function getUserPublicationsFallback(
  userId: string,
  token: string
): Promise<
  Array<ReturnType<typeof transformPublicationFromDB> & { translatedChapterCount?: number }>
> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to get user publications: ${error.message}`);

  const rows = (data || []) as PublicationRow[];
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const translatedCounts: Record<string, number> = {};

  try {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const svc = createServiceRoleClient();
    const { data: counts } = await svc.rpc('get_chapter_counts_by_projects', {
      p_project_ids: projectIds,
    });
    for (const row of counts || []) {
      const r = row as { project_id: string; translated_count?: number };
      translatedCounts[r.project_id] = Number(r.translated_count ?? 0);
    }
  } catch {
    /* service role or RPC unavailable */
  }

  return rows.map((row) => ({
    ...transformPublicationFromDB(row),
    translatedChapterCount: translatedCounts[row.project_id] ?? 0,
  }));
}

/**
 * Get publication by project ID (for owner).
 * @param options.useServiceRole - Use service role client (for long-running ops when JWT may expire)
 */
export async function getPublicationByProjectId(
  projectId: string,
  userId: string,
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<ReturnType<typeof transformPublicationFromDB> | null> {
  if (!options?.useServiceRole) {
    validateToken(token);
  }
  const client = options?.useServiceRole
    ? (await import('../../supabaseClient.js')).createServiceRoleClient()
    : createClientWithToken(token);

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
