/**
 * Extracted from supabaseDatabase.ts
 */

import { createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import {
  createInvalidTranslatorPseudonymError,
  isOwnedActiveTranslatorPseudonym,
} from '../../../shared/translatorPseudonyms.js';
import type { UserRole } from '../../../types/roles.js';
import type { ProjectMetadata } from '../../../storage/types.js';
import type { Project } from '../../../storage/database.js';
import {
  transformCatalogTranslationRequestFromDB,
  transformCatalogTranslationRequestInterestFromDB,
  toBoardTranslationRequest,
  assertRequestOpenForBoard,
  BOARD_OPEN_REQUEST_STATUSES,
  type CatalogTranslationRequest,
  type CatalogTranslationRequestRow,
  type CatalogTranslationRequestStatus,
  type CatalogTranslationRequestInterest,
  type CatalogTranslationRequestInterestRow,
  type CatalogTranslationRequestInterestStatus,
  type BoardTranslationRequest,
  type AdminCatalogTranslationRequest,
} from '../transforms/catalog.js';
import { getPublicEntityById } from './publications.js';
import { getProject, createProject } from './projects.js';

// === Catalog translation requests ===

/**
 * Ensure profiles row exists for an auth user (handles legacy/manual auth users without trigger).
 */
export async function ensureProfileForAuthUser(userId: string): Promise<void> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: existing, error: fetchError } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to check profile: ${fetchError.message}`);
  }
  if (existing) return;

  const { data: authData, error: authError } = await client.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    throw new Error('User not found');
  }

  const { error: insertError } = await client.from('profiles').insert({
    id: userId,
    email: authData.user.email ?? '',
    role: 'user',
  });

  if (insertError && insertError.code !== '23505') {
    throw new Error(`Failed to create profile: ${insertError.message}`);
  }
}

export type {
  CatalogTranslationRequestStatus,
  CatalogTranslationRequestRow,
  CatalogTranslationRequest,
  CatalogTranslationRequestInterestStatus,
  CatalogTranslationRequestInterestRow,
  CatalogTranslationRequestInterest,
  BoardTranslationRequest,
} from '../transforms/catalog.js';
export type { AdminCatalogTranslationRequest } from '../transforms/catalog.js';
export { BOARD_OPEN_REQUEST_STATUSES } from '../transforms/catalog.js';

const MAX_PENDING_CATALOG_REQUESTS_PER_USER = 5;

export async function countPendingCatalogTranslationRequests(
  userId: string,
  token: string
): Promise<number> {
  const client = createClientWithToken(token);

  const { count, error } = await client
    .from('catalog_translation_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) {
    throw new Error(`Failed to count catalog translation requests: ${error.message}`);
  }
  return count ?? 0;
}

export async function createCatalogTranslationRequest(
  userId: string,
  token: string,
  data: {
    title: string;
    authorName?: string;
    sourceLanguage?: string;
    targetLanguage: string;
    comment?: string;
    sourceUrl?: string;
  }
): Promise<CatalogTranslationRequest> {
  await ensureProfileForAuthUser(userId);

  const pendingCount = await countPendingCatalogTranslationRequests(userId, token);
  if (pendingCount >= MAX_PENDING_CATALOG_REQUESTS_PER_USER) {
    const err = new Error('Too many pending translation requests');
    (err as Error & { code?: string }).code = 'PENDING_LIMIT';
    throw err;
  }

  const client = createClientWithToken(token);

  const { data: inserted, error } = await client
    .from('catalog_translation_requests')
    .insert({
      user_id: userId,
      title: data.title,
      author_name: data.authorName ?? null,
      source_language: data.sourceLanguage ?? null,
      target_language: data.targetLanguage,
      comment: data.comment ?? null,
      source_url: data.sourceUrl ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create catalog translation request: ${error.message}`);
  }

  return transformCatalogTranslationRequestFromDB(inserted as CatalogTranslationRequestRow);
}

export async function listCatalogTranslationRequestsByUser(
  userId: string,
  token: string
): Promise<CatalogTranslationRequest[]> {
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('catalog_translation_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list catalog translation requests: ${error.message}`);
  }

  return (data || []).map((row) =>
    transformCatalogTranslationRequestFromDB(row as CatalogTranslationRequestRow)
  );
}

export async function listCatalogTranslationRequestsAdmin(options?: {
  status?: CatalogTranslationRequestStatus;
  search?: string;
  targetLanguage?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminCatalogTranslationRequest[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = client.from('catalog_translation_requests').select('*');

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.targetLanguage) {
    query = query.eq('target_language', options.targetLanguage);
  }
  if (options?.search) {
    const term = options.search.trim();
    query = query.or(`title.ilike.%${term}%,author_name.ilike.%${term}%`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list admin catalog translation requests: ${error.message}`);
  }

  const rows = (data || []) as CatalogTranslationRequestRow[];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const emailByUserId = new Map<string, string>();

  await Promise.all(
    userIds.map(async (id) => {
      const { data: authUser, error: authError } = await client.auth.admin.getUserById(id);
      if (!authError && authUser.user) {
        emailByUserId.set(id, authUser.user.email ?? '');
      }
    })
  );

  return rows.map((row) => ({
    ...transformCatalogTranslationRequestFromDB(row),
    userEmail: emailByUserId.get(row.user_id) ?? '',
  }));
}

export async function updateCatalogTranslationRequestAdmin(
  requestId: string,
  data: {
    status?: CatalogTranslationRequestStatus;
    adminNotes?: string | null;
    linkedPublicationId?: string | null;
  }
): Promise<AdminCatalogTranslationRequest | null> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const patch: Record<string, unknown> = {};
  if (data.status !== undefined) patch.status = data.status;
  if (data.adminNotes !== undefined) patch.admin_notes = data.adminNotes;
  if (data.linkedPublicationId !== undefined) {
    patch.linked_publication_id = data.linkedPublicationId;
  }

  if (Object.keys(patch).length === 0) {
    const { data: existing, error: fetchError } = await client
      .from('catalog_translation_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (fetchError || !existing) return null;
    const row = existing as CatalogTranslationRequestRow;
    const { data: authUser } = await client.auth.admin.getUserById(row.user_id);
    return {
      ...transformCatalogTranslationRequestFromDB(row),
      userEmail: authUser.user?.email ?? '',
    };
  }

  const { data: updated, error } = await client
    .from('catalog_translation_requests')
    .update(patch)
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update catalog translation request: ${error.message}`);
  }

  const row = updated as CatalogTranslationRequestRow;
  const { data: authUser } = await client.auth.admin.getUserById(row.user_id);
  return {
    ...transformCatalogTranslationRequestFromDB(row),
    userEmail: authUser.user?.email ?? '',
  };
}

const DELETABLE_CATALOG_REQUEST_STATUSES: CatalogTranslationRequestStatus[] = [
  'rejected',
  'fulfilled',
];

export async function deleteCatalogTranslationRequestAdmin(requestId: string): Promise<boolean> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: existing, error: fetchError } = await client
    .from('catalog_translation_requests')
    .select('id, status')
    .eq('id', requestId)
    .single();

  if (fetchError || !existing) {
    return false;
  }

  const status = existing.status as CatalogTranslationRequestStatus;
  if (!DELETABLE_CATALOG_REQUEST_STATUSES.includes(status)) {
    const err = new Error('Translation request cannot be deleted in current status');
    (err as Error & { code?: string }).code = 'DELETE_FORBIDDEN';
    throw err;
  }

  const { error: deleteError } = await client
    .from('catalog_translation_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    throw new Error(`Failed to delete catalog translation request: ${deleteError.message}`);
  }

  return true;
}

// --- Catalog translation request board (author interests) ---

export async function getCatalogTranslationRequestById(
  requestId: string
): Promise<CatalogTranslationRequest | null> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('catalog_translation_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get catalog translation request: ${error.message}`);
  }
  if (!data) return null;
  return transformCatalogTranslationRequestFromDB(data as CatalogTranslationRequestRow);
}

export async function listTranslationRequestsBoard(
  userId: string,
  options?: {
    status?: CatalogTranslationRequestStatus;
    search?: string;
    targetLanguage?: string;
    mine?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<BoardTranslationRequest[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = client
    .from('catalog_translation_requests')
    .select('*')
    .in('status', BOARD_OPEN_REQUEST_STATUSES);

  if (options?.status && BOARD_OPEN_REQUEST_STATUSES.includes(options.status)) {
    query = query.eq('status', options.status);
  }
  if (options?.targetLanguage) {
    query = query.eq('target_language', options.targetLanguage);
  }
  if (options?.search) {
    const term = options.search.trim();
    query = query.or(`title.ilike.%${term}%,author_name.ilike.%${term}%`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list translation request board: ${error.message}`);
  }

  const rows = (data || []) as CatalogTranslationRequestRow[];
  if (rows.length === 0) return [];

  const requestIds = rows.map((r) => r.id);

  const { data: interestRows, error: interestError } = await client
    .from('catalog_translation_request_interests')
    .select('*')
    .in('request_id', requestIds)
    .neq('status', 'withdrawn');

  if (interestError) {
    throw new Error(`Failed to list translation request interests: ${interestError.message}`);
  }

  const interests = (interestRows || []) as CatalogTranslationRequestInterestRow[];
  const entityIds = [...new Set(interests.map((i) => i.translator_entity_id))];
  const entityNameById = new Map<string, string>();

  if (entityIds.length > 0) {
    const { data: entities, error: entityError } = await client
      .from('public_entities')
      .select('id, name')
      .in('id', entityIds);
    if (entityError) {
      throw new Error(`Failed to load translator entities: ${entityError.message}`);
    }
    for (const e of entities || []) {
      entityNameById.set(e.id as string, e.name as string);
    }
  }

  const interestsByRequest = new Map<string, CatalogTranslationRequestInterest[]>();
  for (const row of interests) {
    const transformed = transformCatalogTranslationRequestInterestFromDB(
      row,
      entityNameById.get(row.translator_entity_id) ?? ''
    );
    const list = interestsByRequest.get(row.request_id) ?? [];
    list.push(transformed);
    interestsByRequest.set(row.request_id, list);
  }

  let board = rows.map((row) =>
    toBoardTranslationRequest(row, interestsByRequest.get(row.id) ?? [], userId)
  );

  if (options?.mine) {
    board = board.filter((item) => item.myInterest != null);
  }

  return board;
}

export async function getTranslationRequestInterestForUser(
  requestId: string,
  userId: string,
  token: string
): Promise<CatalogTranslationRequestInterest | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('catalog_translation_request_interests')
    .select('*')
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get translation request interest: ${error.message}`);
  }
  if (!data) return null;

  const row = data as CatalogTranslationRequestInterestRow;
  const entity = await getPublicEntityById(row.translator_entity_id);
  return transformCatalogTranslationRequestInterestFromDB(row, entity?.name ?? '');
}

export async function createTranslationRequestInterest(
  requestId: string,
  userId: string,
  token: string,
  translatorEntityId: string
): Promise<CatalogTranslationRequestInterest> {
  validateToken(token);

  const request = await getCatalogTranslationRequestById(requestId);
  if (!request) {
    const err = new Error('Translation request not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertRequestOpenForBoard(request);

  if (request.userId === userId) {
    const err = new Error('Cannot take your own translation request');
    (err as Error & { code?: string }).code = 'SELF_ASSIGN';
    throw err;
  }

  const entity = await getPublicEntityById(translatorEntityId);
  if (!entity || entity.kind !== 'translator') {
    const err = new Error('Invalid translator entity');
    (err as Error & { code?: string }).code = 'INVALID_TRANSLATOR';
    throw err;
  }
  if (!isOwnedActiveTranslatorPseudonym(entity, userId)) {
    throw createInvalidTranslatorPseudonymError();
  }

  const existing = await getTranslationRequestInterestForUser(requestId, userId, token);
  if (existing && existing.status !== 'withdrawn') {
    const err = new Error('Interest already exists');
    (err as Error & { code?: string }).code = 'INTEREST_EXISTS';
    throw err;
  }

  const client = createClientWithToken(token);

  if (existing?.status === 'withdrawn') {
    const { data: updated, error } = await client
      .from('catalog_translation_request_interests')
      .update({
        translator_entity_id: translatorEntityId,
        status: 'interested',
        project_id: null,
      })
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const dup = new Error('Interest already exists');
        (dup as Error & { code?: string }).code = 'INTEREST_EXISTS';
        throw dup;
      }
      throw new Error(`Failed to update translation request interest: ${error.message}`);
    }

    return transformCatalogTranslationRequestInterestFromDB(
      updated as CatalogTranslationRequestInterestRow,
      entity.name
    );
  }

  const { data: inserted, error } = await client
    .from('catalog_translation_request_interests')
    .insert({
      request_id: requestId,
      user_id: userId,
      translator_entity_id: translatorEntityId,
      status: 'interested',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const dup = new Error('Interest already exists');
      (dup as Error & { code?: string }).code = 'INTEREST_EXISTS';
      throw dup;
    }
    throw new Error(`Failed to create translation request interest: ${error.message}`);
  }

  return transformCatalogTranslationRequestInterestFromDB(
    inserted as CatalogTranslationRequestInterestRow,
    entity.name
  );
}

export async function updateTranslationRequestInterestMe(
  requestId: string,
  userId: string,
  token: string,
  data: {
    projectId?: string;
    status?: CatalogTranslationRequestInterestStatus;
  }
): Promise<CatalogTranslationRequestInterest | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const patch: Record<string, unknown> = {};
  if (data.projectId !== undefined) {
    patch.project_id = data.projectId;
    patch.status = 'working';
  }
  if (data.status !== undefined) {
    patch.status = data.status;
  }

  if (Object.keys(patch).length === 0) {
    return getTranslationRequestInterestForUser(requestId, userId, token);
  }

  const { data: updated, error } = await client
    .from('catalog_translation_request_interests')
    .update(patch)
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update translation request interest: ${error.message}`);
  }
  if (!updated) return null;

  const row = updated as CatalogTranslationRequestInterestRow;
  const entity = await getPublicEntityById(row.translator_entity_id);
  return transformCatalogTranslationRequestInterestFromDB(row, entity?.name ?? '');
}

export async function withdrawTranslationRequestInterest(
  requestId: string,
  userId: string,
  token: string
): Promise<boolean> {
  const updated = await updateTranslationRequestInterestMe(requestId, userId, token, {
    status: 'withdrawn',
  });
  return updated != null;
}

export async function createProjectFromCatalogRequest(
  data: {
    name: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    role?: UserRole;
    catalogTranslationRequestId: string;
    translatorEntityId?: string;
  },
  userId: string,
  token: string
): Promise<Project> {
  const request = await getCatalogTranslationRequestById(data.catalogTranslationRequestId);
  if (!request) {
    const err = new Error('Translation request not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  assertRequestOpenForBoard(request);

  if (request.userId === userId) {
    const err = new Error('Cannot take your own translation request');
    (err as Error & { code?: string }).code = 'SELF_ASSIGN';
    throw err;
  }

  let interest = await getTranslationRequestInterestForUser(
    data.catalogTranslationRequestId,
    userId,
    token
  );

  if (interest?.status === 'working' && interest.projectId) {
    const existingProject = await getProject(interest.projectId, userId, token);
    if (existingProject) {
      return existingProject as unknown as Project;
    }
  }

  const translatorEntityId = data.translatorEntityId ?? interest?.translatorEntityId ?? undefined;
  if (!translatorEntityId) {
    const err = new Error('Translator entity is required');
    (err as Error & { code?: string }).code = 'INVALID_TRANSLATOR';
    throw err;
  }

  if (!interest || interest.status === 'withdrawn') {
    interest = await createTranslationRequestInterest(
      data.catalogTranslationRequestId,
      userId,
      token,
      translatorEntityId
    );
  }

  const metadata: ProjectMetadata = {
    title: request.title,
    sourceUrl: request.sourceUrl ?? undefined,
    translatorEntityId,
    catalogTranslationRequestId: request.id,
  };
  if (request.authorName) {
    metadata.authors = [request.authorName];
  }

  const project = await createProject(
    {
      name: data.name || request.title,
      sourceLanguage: data.sourceLanguage ?? request.sourceLanguage ?? 'en',
      targetLanguage: data.targetLanguage ?? request.targetLanguage,
      role: data.role,
      metadata,
    },
    userId,
    token
  );

  await updateTranslationRequestInterestMe(data.catalogTranslationRequestId, userId, token, {
    projectId: project.id,
  });

  return {
    ...project,
    metadata,
  };
}
