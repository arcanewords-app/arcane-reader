/**
 * News and announcement row transforms — extracted from supabaseDatabase for unit testing.
 */

import type {
  AnnouncementAlert,
  AnnouncementMinRole,
  AnnouncementVariant,
  NewsCategory,
  NewsPost,
  NewsStatus,
} from '../../../storage/database.js';

export interface NewsPostRow {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  body: string;
  category: NewsCategory;
  status: NewsStatus;
  primary_locale: string;
  translations: Record<string, unknown> | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementAlertRow {
  id: string;
  news_post_id: string | null;
  message: string | null;
  cta_label: string | null;
  cta_url: string | null;
  variant: AnnouncementVariant;
  min_role: AnnouncementMinRole;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  priority: number;
  content_version: number;
  dismissible: boolean;
  created_at: string;
  updated_at: string;
}

export function transformNewsPostFromDB(row: NewsPostRow): NewsPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    status: row.status,
    primaryLocale: row.primary_locale,
    translations: row.translations ?? {},
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformAnnouncementFromDB(row: AnnouncementAlertRow): AnnouncementAlert {
  return {
    id: row.id,
    newsPostId: row.news_post_id,
    message: row.message,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    variant: row.variant,
    minRole: row.min_role,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    priority: row.priority,
    contentVersion: row.content_version,
    dismissible: row.dismissible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
