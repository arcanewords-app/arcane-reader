/**
 * Extracted from supabaseDatabase.ts
 */

import type { TranslationStatus } from '../../../shared/translation-status.js';
import {
  transformPublicationFromDB,
  type PublicationRow,
  type PublicationStatus,
  type PublicationListRow,
} from '../transforms/publication.js';

export interface AdminPublicationListItem {
  id: string;
  projectId: string;
  userId: string;
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
  translationStatus: TranslationStatus | null;
  translatedChapterCount: number;
}

export async function listPublicationsAdmin(options?: {
  status?: PublicationStatus;
  search?: string;
  targetLanguage?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminPublicationListItem[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = client.from('publications_list_with_counts').select('*');

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.targetLanguage) {
    query = query.eq('target_language', options.targetLanguage);
  }
  if (options?.search) {
    query = query.ilike('title', `%${options.search}%`);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      let fallback = client.from('publications').select('*');
      if (options?.status) fallback = fallback.eq('status', options.status);
      if (options?.targetLanguage)
        fallback = fallback.eq('target_language', options.targetLanguage);
      if (options?.search) fallback = fallback.ilike('title', `%${options.search}%`);
      const fb = await fallback
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (fb.error) throw new Error(`Failed to list publications: ${fb.error.message}`);
      return (fb.data || []).map((row: PublicationRow) => ({
        ...transformPublicationFromDB(row),
        translatedChapterCount: 0,
      }));
    }
    throw new Error(`Failed to list publications: ${error.message}`);
  }

  return (data || []).map((row: PublicationListRow) => ({
    ...transformPublicationFromDB(row),
    translatedChapterCount: row.translated_chapter_count ?? 0,
  }));
}

export async function unpublishPublicationAdmin(publicationId: string): Promise<boolean> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('publications')
    .update({ status: 'unpublished', updated_at: new Date().toISOString() })
    .eq('id', publicationId)
    .select('id, slug')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return false;
    throw new Error(`Failed to unpublish publication: ${error.message}`);
  }
  return !!data;
}

// ============================================
// Admin: projects
// ============================================

export interface AdminProjectListItem {
  id: string;
  name: string;
  userId: string;
  ownerEmail: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapterCount: number;
  translatedCount: number;
  createdAt: string;
  updatedAt: string;
  publicationId: string | null;
  publicationStatus: PublicationStatus | null;
  publicationTitle: string | null;
  publicationSlug: string | null;
}

export interface AdminProjectDeleteResult {
  deleted: boolean;
  userId: string | null;
  publicationId: string | null;
  publicationSlug: string | null;
}

export async function listProjectsAdmin(options?: {
  search?: string;
  publicationStatus?: PublicationStatus | 'none';
  targetLanguage?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminProjectListItem[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = client
    .from('projects')
    .select('id, name, user_id, source_language, target_language, created_at, updated_at');

  if (options?.targetLanguage) {
    query = query.eq('target_language', options.targetLanguage);
  }

  if (options?.publicationStatus && options.publicationStatus !== 'none') {
    const { data: pubs, error: pubFilterError } = await client
      .from('publications')
      .select('project_id')
      .eq('status', options.publicationStatus);
    if (pubFilterError) {
      throw new Error(`Failed to filter projects by publication status: ${pubFilterError.message}`);
    }
    const ids = (pubs || []).map((p) => p.project_id as string);
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  } else if (options?.publicationStatus === 'none') {
    const { data: pubs, error: pubFilterError } = await client
      .from('publications')
      .select('project_id');
    if (pubFilterError) {
      throw new Error(`Failed to filter projects without publication: ${pubFilterError.message}`);
    }
    const idsWithPub = (pubs || []).map((p) => p.project_id as string);
    if (idsWithPub.length > 0) {
      query = query.not('id', 'in', `(${idsWithPub.join(',')})`);
    }
  }

  if (options?.search) {
    const term = options.search.trim();
    const { data: pubMatches, error: pubSearchError } = await client
      .from('publications')
      .select('project_id')
      .ilike('title', `%${term}%`);
    if (pubSearchError) {
      throw new Error(`Failed to search projects: ${pubSearchError.message}`);
    }
    const pubProjectIds = (pubMatches || []).map((p) => p.project_id as string);
    if (pubProjectIds.length > 0) {
      query = query.or(`name.ilike.%${term}%,id.in.(${pubProjectIds.join(',')})`);
    } else {
      query = query.ilike('name', `%${term}%`);
    }
  }

  const { data: projects, error } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list admin projects: ${error.message}`);
  }

  const rows = projects || [];
  if (rows.length === 0) return [];

  const projectIds = rows.map((p) => p.id as string);

  const [{ data: publications, error: publicationsError }, { data: countRows, error: countError }] =
    await Promise.all([
      client
        .from('publications')
        .select('id, project_id, status, title, slug')
        .in('project_id', projectIds),
      client.rpc('get_chapter_counts_by_projects', { p_project_ids: projectIds }),
    ]);

  if (publicationsError) {
    throw new Error(`Failed to load project publications: ${publicationsError.message}`);
  }
  if (countError) {
    throw new Error(`Failed to load project chapter counts: ${countError.message}`);
  }

  const publicationByProjectId = new Map(
    (publications || []).map((pub) => [pub.project_id as string, pub])
  );
  const chapterCounts: Record<string, number> = {};
  const translatedCounts: Record<string, number> = {};
  for (const row of countRows || []) {
    const pid = row.project_id as string;
    chapterCounts[pid] = Number(row.total_count ?? 0);
    translatedCounts[pid] = Number(row.translated_count ?? 0);
  }

  const userIds = [...new Set(rows.map((p) => p.user_id as string))];
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data: authUser, error: authError } = await client.auth.admin.getUserById(id);
      if (!authError && authUser.user) {
        emailByUserId.set(id, authUser.user.email ?? '');
      }
    })
  );

  return rows.map((row) => {
    const pub = publicationByProjectId.get(row.id as string);
    return {
      id: row.id as string,
      name: row.name as string,
      userId: row.user_id as string,
      ownerEmail: emailByUserId.get(row.user_id as string) ?? '',
      sourceLanguage: (row.source_language as string) || 'en',
      targetLanguage: (row.target_language as string) || 'ru',
      chapterCount: chapterCounts[row.id as string] ?? 0,
      translatedCount: translatedCounts[row.id as string] ?? 0,
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
      publicationId: (pub?.id as string) ?? null,
      publicationStatus: (pub?.status as PublicationStatus) ?? null,
      publicationTitle: (pub?.title as string) ?? null,
      publicationSlug: (pub?.slug as string) ?? null,
    };
  });
}

export async function unpublishProjectAdmin(
  projectId: string
): Promise<{ publicationId: string; slug: string | null } | null> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('publications')
    .update({ status: 'unpublished', updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select('id, slug')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to unpublish project: ${error.message}`);
  }

  return {
    publicationId: data.id as string,
    slug: (data.slug as string) ?? null,
  };
}

export async function deleteProjectAdmin(projectId: string): Promise<AdminProjectDeleteResult> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: project, error: fetchError } = await client
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return { deleted: false, userId: null, publicationId: null, publicationSlug: null };
    }
    throw new Error(`Failed to load project for delete: ${fetchError.message}`);
  }

  const { data: pub } = await client
    .from('publications')
    .select('id, slug')
    .eq('project_id', projectId)
    .maybeSingle();

  const { error: deleteError } = await client.from('projects').delete().eq('id', projectId);
  if (deleteError) {
    throw new Error(`Failed to delete project: ${deleteError.message}`);
  }

  return {
    deleted: true,
    userId: project.user_id as string,
    publicationId: (pub?.id as string) ?? null,
    publicationSlug: (pub?.slug as string) ?? null,
  };
}

export interface AdminUserListItem {
  id: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  createdAt: string | null;
}

export async function listUsersAdmin(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminUserListItem[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const search = options?.search?.trim().toLowerCase();

  const { data: authData, error: authError } = await client.auth.admin.listUsers({
    page,
    perPage: limit,
  });
  if (authError) {
    throw new Error(`Failed to list users: ${authError.message}`);
  }

  const users = authData.users || [];
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, role, avatar_url, created_at')
    .in('id', ids);

  if (profileError) {
    throw new Error(`Failed to load user profiles: ${profileError.message}`);
  }

  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  let items: AdminUserListItem[] = users.map((user) => {
    const profile = profileById.get(user.id);
    return {
      id: user.id,
      email: user.email ?? '',
      role: profile?.role ?? 'user',
      avatarUrl: profile?.avatar_url ?? null,
      createdAt: profile?.created_at ?? user.created_at ?? null,
    };
  });

  if (search) {
    items = items.filter(
      (u) => u.email.toLowerCase().includes(search) || u.role.toLowerCase().includes(search)
    );
  }

  return items;
}

export async function countAdminUsersWithRole(role: string): Promise<number> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();
  const { count, error } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', role);
  if (error) throw new Error(`Failed to count admins: ${error.message}`);
  return count ?? 0;
}

export async function updateUserRoleAdmin(
  userId: string,
  role: string
): Promise<AdminUserListItem | null> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data: profile, error } = await client
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('id, role, avatar_url, created_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update user role: ${error.message}`);
  }

  const { data: authUser, error: authError } = await client.auth.admin.getUserById(userId);
  if (authError) {
    throw new Error(`Failed to load user: ${authError.message}`);
  }

  return {
    id: userId,
    email: authUser.user?.email ?? '',
    role: profile.role ?? role,
    avatarUrl: profile.avatar_url ?? null,
    createdAt: profile.created_at ?? authUser.user?.created_at ?? null,
  };
}
