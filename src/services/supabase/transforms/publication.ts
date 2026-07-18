/**
 * Publication / public entity row transforms — extracted from supabaseDatabase for unit testing.
 */

import { isTranslationStatus, type TranslationStatus } from '../../../shared/translation-status.js';
import type { PublicEntity, PublicEntityKind } from '../../../storage/database.js';

export type PublicationStatus = 'draft' | 'published' | 'unpublished';

export interface PublicationRow {
  id: string;
  project_id: string;
  user_id: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  author_display: string | null;
  translator_display: string | null;
  author_entity_id?: string | null;
  translator_entity_id?: string | null;
  tag_entity_ids?: string[] | null;
  source_language: string;
  target_language: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  epub_storage_path?: string | null;
  fb2_storage_path?: string | null;
  show_glossary?: boolean | null;
  translation_status?: string | null;
  source_url?: string | null;
  rating_avg?: number | string | null;
  rating_count?: number | null;
  rating_bayesian?: number | string | null;
}

export interface PublicationListRow extends PublicationRow {
  translated_chapter_count?: number;
}

export interface PublicEntityRow {
  id: string;
  kind: PublicEntityKind;
  name: string;
  description: string | null;
  photo_url: string | null;
  created_by: string | null;
  owner_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function transformPublicationFromDB(row: PublicationRow): {
  id: string;
  projectId: string;
  userId: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplay: string | null;
  translatorDisplay: string | null;
  authorEntityId: string | null;
  translatorEntityId: string | null;
  tagEntityIds: string[];
  sourceLanguage: string;
  targetLanguage: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slug: string | null;
  epubStoragePath: string | null;
  fb2StoragePath: string | null;
  showGlossary: boolean;
  translationStatus: TranslationStatus | null;
  sourceUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  ratingBayesian: number | null;
} {
  const rawStatus = (row as { translation_status?: string | null }).translation_status;
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    authorDisplay: row.author_display,
    translatorDisplay: (row as { translator_display?: string | null }).translator_display ?? null,
    authorEntityId: (row as { author_entity_id?: string | null }).author_entity_id ?? null,
    translatorEntityId:
      (row as { translator_entity_id?: string | null }).translator_entity_id ?? null,
    tagEntityIds: (row as { tag_entity_ids?: string[] | null }).tag_entity_ids ?? [],
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: (row as { slug?: string | null }).slug ?? null,
    epubStoragePath: (row as { epub_storage_path?: string | null }).epub_storage_path ?? null,
    fb2StoragePath: (row as { fb2_storage_path?: string | null }).fb2_storage_path ?? null,
    showGlossary: (row as { show_glossary?: boolean | null }).show_glossary !== false,
    translationStatus: isTranslationStatus(rawStatus) ? rawStatus : null,
    sourceUrl: (row as { source_url?: string | null }).source_url ?? null,
    ratingAvg: row.rating_avg != null && row.rating_avg !== '' ? Number(row.rating_avg) : null,
    ratingCount: Number(row.rating_count ?? 0),
    ratingBayesian:
      row.rating_bayesian != null && row.rating_bayesian !== ''
        ? Number(row.rating_bayesian)
        : null,
  };
}

export function transformPublicEntityFromDB(row: PublicEntityRow): PublicEntity {
  const entityStatus = row.status === 'blocked' ? 'blocked' : ('active' as const);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description ?? undefined,
    photoUrl: row.photo_url,
    createdBy: row.created_by,
    ownerUserId: row.owner_user_id,
    entityStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
