/**
 * Extracted from supabaseDatabase.ts
 */

import { supabase, createClientWithToken } from '../../supabaseClient.js';
import { validateToken } from '../../../utils/tokenValidation.js';
import type {
  NewsPost,
  NewsCategory,
  NewsStatus,
  AnnouncementAlert,
  AnnouncementVariant,
  AnnouncementMinRole,
  ActiveAnnouncement,
} from '../../../storage/database.js';
import {
  transformNewsPostFromDB,
  transformAnnouncementFromDB,
  type NewsPostRow,
  type AnnouncementAlertRow,
} from '../transforms/news.js';
import { resolveAlertMessage, isAnnouncementScheduledActive } from '../pure/announcements.js';

export async function listPublishedNewsPosts(options?: {
  limit?: number;
  offset?: number;
  category?: NewsCategory;
}): Promise<NewsPost[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('news_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list news posts: ${error.message}`);
  }
  return (data || []).map((row) => transformNewsPostFromDB(row as NewsPostRow));
}

export async function getPublishedNewsPostByIdOrSlug(idOrSlug: string): Promise<NewsPost | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  let query = supabase.from('news_posts').select('*').eq('status', 'published');
  query = isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to get news post: ${error.message}`);
  }
  if (!data) return null;
  return transformNewsPostFromDB(data as NewsPostRow);
}

export async function listNewsPostsAdmin(options?: {
  status?: NewsStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<NewsPost[]> {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  let query = client.from('news_posts').select('*');

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.search) {
    const term = options.search.trim();
    query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list admin news posts: ${error.message}`);
  }
  return (data || []).map((row) => transformNewsPostFromDB(row as NewsPostRow));
}

export async function getNewsPostByIdAdmin(id: string): Promise<NewsPost | null> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data, error } = await client.from('news_posts').select('*').eq('id', id).maybeSingle();
  if (error) {
    throw new Error(`Failed to get news post: ${error.message}`);
  }
  if (!data) return null;
  return transformNewsPostFromDB(data as NewsPostRow);
}

export async function createNewsPost(
  data: {
    title: string;
    summary: string;
    body?: string;
    category?: NewsCategory;
    slug?: string | null;
    createdBy?: string;
  },
  token: string
): Promise<NewsPost> {
  validateToken(token);
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const now = new Date().toISOString();
  const payload = {
    title: data.title.trim(),
    summary: data.summary.trim(),
    body: data.body ?? '',
    category: data.category ?? 'other',
    slug: data.slug ?? null,
    status: 'draft' as const,
    primary_locale: 'ru',
    translations: {},
    created_by: data.createdBy ?? null,
    created_at: now,
    updated_at: now,
  };

  const { data: row, error } = await client.from('news_posts').insert(payload).select('*').single();
  if (error || !row) {
    throw new Error(`Failed to create news post: ${error?.message || 'Unknown error'}`);
  }
  return transformNewsPostFromDB(row as NewsPostRow);
}

export async function updateNewsPost(
  id: string,
  data: {
    title?: string;
    summary?: string;
    body?: string;
    category?: NewsCategory;
    status?: NewsStatus;
    slug?: string | null;
  }
): Promise<NewsPost> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) payload.title = data.title.trim();
  if (data.summary !== undefined) payload.summary = data.summary.trim();
  if (data.body !== undefined) payload.body = data.body;
  if (data.category !== undefined) payload.category = data.category;
  if (data.status !== undefined) payload.status = data.status;
  if (data.slug !== undefined) payload.slug = data.slug;

  const { data: row, error } = await client
    .from('news_posts')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update news post: ${error.message}`);
  }
  if (!row) {
    throw new Error('Failed to update news post: not found');
  }
  return transformNewsPostFromDB(row as NewsPostRow);
}

export async function publishNewsPost(id: string): Promise<NewsPost> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const now = new Date().toISOString();
  const { data: row, error } = await client
    .from('news_posts')
    .update({
      status: 'published',
      published_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to publish news post: ${error.message}`);
  }
  if (!row) {
    const existing = await getNewsPostByIdAdmin(id);
    if (!existing) throw new Error('News post not found');
    if (existing.status !== 'draft') {
      throw new Error('News post is not a draft');
    }
    throw new Error('Failed to publish news post');
  }
  return transformNewsPostFromDB(row as NewsPostRow);
}

export async function deleteNewsPost(id: string): Promise<void> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { count, error: countError } = await client
    .from('announcement_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('news_post_id', id)
    .eq('is_active', true);

  if (countError) {
    throw new Error(`Failed to check announcement alerts: ${countError.message}`);
  }
  if ((count ?? 0) > 0) {
    const err = new Error('Cannot delete news post with active announcement alerts');
    (err as Error & { code?: string }).code = 'NEWS_HAS_ACTIVE_ALERTS';
    throw err;
  }

  const { error } = await client.from('news_posts').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete news post: ${error.message}`);
  }
}

export async function listAnnouncementAlertsAdmin(): Promise<AnnouncementAlert[]> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { data, error } = await client
    .from('announcement_alerts')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list announcement alerts: ${error.message}`);
  }
  return (data || []).map((row) => transformAnnouncementFromDB(row as AnnouncementAlertRow));
}

export async function createAnnouncementAlert(data: {
  newsPostId?: string | null;
  message?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  variant?: AnnouncementVariant;
  minRole?: AnnouncementMinRole;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
  dismissible?: boolean;
}): Promise<AnnouncementAlert> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  if (data.newsPostId) {
    const post = await getNewsPostByIdAdmin(data.newsPostId);
    if (!post) throw new Error('News post not found');
    if (post.status !== 'published') {
      const err = new Error('Cannot create alert from unpublished news post');
      (err as Error & { code?: string }).code = 'NEWS_NOT_PUBLISHED';
      throw err;
    }
  }

  const now = new Date().toISOString();
  const payload = {
    news_post_id: data.newsPostId ?? null,
    message: data.message?.trim() || null,
    cta_label: data.ctaLabel?.trim() || null,
    cta_url: data.ctaUrl?.trim() || null,
    variant: data.variant ?? 'info',
    min_role: data.minRole ?? 'guest',
    starts_at: data.startsAt ?? null,
    ends_at: data.endsAt ?? null,
    is_active: data.isActive ?? true,
    priority: data.priority ?? 0,
    content_version: 1,
    dismissible: data.dismissible ?? true,
    created_at: now,
    updated_at: now,
  };

  const { data: row, error } = await client
    .from('announcement_alerts')
    .insert(payload)
    .select('*')
    .single();

  if (error || !row) {
    throw new Error(`Failed to create announcement alert: ${error?.message || 'Unknown error'}`);
  }
  return transformAnnouncementFromDB(row as AnnouncementAlertRow);
}

export async function createAnnouncementFromNews(
  newsId: string,
  data: {
    message?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    variant?: AnnouncementVariant;
    minRole?: AnnouncementMinRole;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive?: boolean;
    priority?: number;
    dismissible?: boolean;
  }
): Promise<AnnouncementAlert> {
  const post = await getNewsPostByIdAdmin(newsId);
  if (!post) throw new Error('News post not found');
  if (post.status !== 'published') {
    const err = new Error('Cannot create alert from unpublished news post');
    (err as Error & { code?: string }).code = 'NEWS_NOT_PUBLISHED';
    throw err;
  }

  const slugOrId = post.slug || post.id;
  return createAnnouncementAlert({
    newsPostId: newsId,
    message: data.message ?? post.summary,
    ctaLabel: data.ctaLabel ?? null,
    ctaUrl: data.ctaUrl ?? `/news/${slugOrId}`,
    variant: data.variant,
    minRole: data.minRole,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    isActive: data.isActive,
    priority: data.priority,
    dismissible: data.dismissible,
  });
}

export async function updateAnnouncementAlert(
  id: string,
  data: {
    message?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    variant?: AnnouncementVariant;
    minRole?: AnnouncementMinRole;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive?: boolean;
    priority?: number;
    contentVersion?: number;
    dismissible?: boolean;
    newsPostId?: string | null;
  }
): Promise<AnnouncementAlert> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.message !== undefined) payload.message = data.message?.trim() || null;
  if (data.ctaLabel !== undefined) payload.cta_label = data.ctaLabel?.trim() || null;
  if (data.ctaUrl !== undefined) payload.cta_url = data.ctaUrl?.trim() || null;
  if (data.variant !== undefined) payload.variant = data.variant;
  if (data.minRole !== undefined) payload.min_role = data.minRole;
  if (data.startsAt !== undefined) payload.starts_at = data.startsAt;
  if (data.endsAt !== undefined) payload.ends_at = data.endsAt;
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.priority !== undefined) payload.priority = data.priority;
  if (data.contentVersion !== undefined) payload.content_version = data.contentVersion;
  if (data.dismissible !== undefined) payload.dismissible = data.dismissible;
  if (data.newsPostId !== undefined) payload.news_post_id = data.newsPostId;

  const { data: row, error } = await client
    .from('announcement_alerts')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update announcement alert: ${error.message}`);
  }
  if (!row) {
    throw new Error('Announcement alert not found');
  }
  return transformAnnouncementFromDB(row as AnnouncementAlertRow);
}

export async function deleteAnnouncementAlert(id: string): Promise<void> {
  const { createServiceRoleClient } = await import('../../supabaseClient.js');
  const client = createServiceRoleClient();

  const { error } = await client.from('announcement_alerts').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete announcement alert: ${error.message}`);
  }
}

export async function getActiveAnnouncementForUser(options: {
  userRole: AnnouncementMinRole;
  userId?: string | null;
}): Promise<ActiveAnnouncement | null> {
  const now = new Date();
  const { data, error } = await supabase
    .from('announcement_alerts')
    .select('*, news_posts(summary, slug)')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .order('starts_at', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to get active announcements: ${error.message}`);
  }

  const { isAtLeastRole } = await import('../../../types/roles.js');
  const rows = (data || []) as Array<
    AnnouncementAlertRow & { news_posts: { summary: string; slug: string | null } | null }
  >;

  let dismissals = new Map<string, number>();
  if (options.userId) {
    const { createServiceRoleClient } = await import('../../supabaseClient.js');
    const client = createServiceRoleClient();
    const { data: dismissalRows, error: dismissalError } = await client
      .from('user_announcement_dismissals')
      .select('announcement_id, content_version')
      .eq('user_id', options.userId);

    if (dismissalError) {
      throw new Error(`Failed to get dismissals: ${dismissalError.message}`);
    }
    dismissals = new Map(
      (dismissalRows || []).map((d) => [d.announcement_id, d.content_version as number])
    );
  }

  for (const row of rows) {
    if (!isAnnouncementScheduledActive(row, now)) continue;
    if (!isAtLeastRole(options.userRole, row.min_role)) continue;

    const dismissedVersion = dismissals.get(row.id);
    if (dismissedVersion != null && dismissedVersion >= row.content_version) continue;

    const newsSummary = row.news_posts?.summary ?? null;
    const message = resolveAlertMessage(row, newsSummary);
    if (!message) continue;

    const newsSlug = row.news_posts?.slug ?? null;
    const ctaUrl =
      row.cta_url?.trim() ||
      (row.news_post_id && newsSlug ? `/news/${newsSlug}` : null) ||
      (row.news_post_id ? `/news/${row.news_post_id}` : null);

    return {
      id: row.id,
      message,
      ctaLabel: row.cta_label,
      ctaUrl,
      newsPostId: row.news_post_id,
      variant: row.variant,
      contentVersion: row.content_version,
      dismissible: row.dismissible,
    };
  }

  return null;
}

export async function dismissAnnouncement(
  userId: string,
  announcementId: string,
  contentVersion: number,
  token: string
): Promise<void> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { error } = await client.from('user_announcement_dismissals').upsert(
    {
      user_id: userId,
      announcement_id: announcementId,
      content_version: contentVersion,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,announcement_id' }
  );

  if (error) {
    throw new Error(`Failed to dismiss announcement: ${error.message}`);
  }
}
