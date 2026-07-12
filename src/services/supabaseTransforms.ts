/**
 * Pure DB row transforms and normalization — extracted from supabaseDatabase for unit testing.
 */

import { defaultStageModelsForRole, roleHasPremiumModelAccess } from '../shared/modelAccess.js';
import type { UserRole } from '../types/roles.js';
import type {
  Chapter,
  ChapterListItem,
  ChapterStatus,
  GlossaryEntry,
  Paragraph,
  ParagraphStatus,
  Project,
  ProjectSettings,
  ProjectWithChapterList,
} from '../storage/database.js';
import { DEFAULT_READER_SETTINGS } from '../storage/database.js';

/** Allowed values for glossary_entries.gender (DB check constraint) */
const ALLOWED_GENDERS = ['male', 'female', 'neutral', 'unknown'] as const;
type AllowedGender = (typeof ALLOWED_GENDERS)[number];

export function normalizeGenderForDB(value: unknown): AllowedGender | null {
  if (value == null || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'masculine') return 'male';
  if (s === 'female' || s === 'f' || s === 'feminine') return 'female';
  if (s === 'neutral' || s === 'n' || s === 'other' || s === 'non-binary') return 'neutral';
  if (s === 'unknown' || s === 'u') return 'unknown';
  if (ALLOWED_GENDERS.includes(s as AllowedGender)) return s as AllowedGender;
  return null;
}

const ALLOWED_ENTRY_TYPES = ['character', 'location', 'term'] as const;
type AllowedEntryType = (typeof ALLOWED_ENTRY_TYPES)[number];

export function normalizeGlossaryTypeForDB(value: unknown): AllowedEntryType {
  if (value == null || value === '') return 'term';
  const s = String(value).trim().toLowerCase();
  if (s === 'character' || s === 'char' || s === 'c') return 'character';
  if (s === 'location' || s === 'loc' || s === 'place' || s === 'l') return 'location';
  if (s === 'term' || s === 't') return 'term';
  if (ALLOWED_ENTRY_TYPES.includes(s as AllowedEntryType)) return s as AllowedEntryType;
  return 'term';
}

export function getDefaultProjectSettings(role: UserRole = 'author'): ProjectSettings {
  const stageModels = defaultStageModelsForRole(role);
  const premium = roleHasPremiumModelAccess(role);
  return {
    stageModels,
    translateExecutionMode: premium ? 'one_shot' : 'chunked',
    editExecutionMode: premium ? 'one_shot' : 'chunked',
    temperature: 0.7,
    enableAnalysis: true,
    enableTranslation: true,
    enableEditing: true,
    includeGlossaryInAnalysis: true,
    includeGlossaryInTranslation: true,
    includeGlossaryInEditing: true,
    reader: { ...DEFAULT_READER_SETTINGS },
  };
}

export function transformProjectFromDBWithChapterList(
  row: Record<string, unknown>,
  chapters: ChapterListItem[] = [],
  glossary: GlossaryEntry[] = []
): ProjectWithChapterList {
  const r = row as Record<string, unknown> & {
    id: string;
    name: string;
    type?: string;
    metadata?: unknown;
    source_language?: string;
    target_language?: string;
    settings?: ProjectSettings;
    created_at?: string;
    updated_at?: string;
  };
  let projectType = (r.type as string) || 'text';
  if (!r.type && r.metadata) {
    projectType = 'book';
  }
  return {
    id: r.id,
    name: r.name,
    type: projectType,
    sourceLanguage: r.source_language ?? 'en',
    targetLanguage: r.target_language ?? 'ru',
    settings: (r.settings as ProjectSettings) || getDefaultProjectSettings(),
    metadata: r.metadata || undefined,
    chapters,
    glossary,
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  };
}

export function transformProjectFromDB(
  row: Record<string, unknown>,
  chapters: Chapter[] = [],
  glossary: GlossaryEntry[] = []
): Project {
  const r = row as Record<string, unknown> & {
    id: string;
    name: string;
    type?: string;
    metadata?: unknown;
    source_language?: string;
    target_language?: string;
    settings?: ProjectSettings;
    created_at?: string;
    updated_at?: string;
  };
  let projectType = (r.type as string) || 'text';
  if (!r.type && r.metadata) {
    projectType = 'book';
  }

  return {
    id: r.id,
    name: r.name,
    type: projectType,
    sourceLanguage: r.source_language ?? 'en',
    targetLanguage: r.target_language ?? 'ru',
    settings: (r.settings as ProjectSettings) || getDefaultProjectSettings(),
    metadata: r.metadata || undefined,
    chapters,
    glossary,
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  };
}

export function transformProjectToDB(project: Partial<Project>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: project.name,
    source_language: project.sourceLanguage,
    target_language: project.targetLanguage,
    settings: project.settings,
  };

  if (project.type !== undefined) {
    result.type = project.type;
  }

  if (project.metadata !== undefined) {
    result.metadata = project.metadata;
  }

  return result;
}

export function transformChapterFromDB(
  row: Record<string, unknown>,
  paragraphs: Paragraph[] = []
): Chapter {
  const r = row as Record<string, unknown> & {
    id: string;
    number: number;
    title: string;
    translated_title?: string | null;
    original_text?: string;
    translated_text?: string;
    translated_chunks?: unknown;
    status: string;
    translation_meta?: unknown;
    critic_report?: unknown;
  };
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    translatedTitle: r.translated_title?.trim() || undefined,
    originalText: r.original_text ?? '',
    translatedText: r.translated_text || undefined,
    translatedChunks: r.translated_chunks as Chapter['translatedChunks'] | undefined,
    status: r.status as ChapterStatus,
    translationMeta: r.translation_meta
      ? (r.translation_meta as Chapter['translationMeta'])
      : undefined,
    criticReport: r.critic_report ? (r.critic_report as Chapter['criticReport']) : undefined,
    paragraphs,
  };
}

export function transformChapterToDB(chapter: Partial<Chapter>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (chapter.number !== undefined) result.number = chapter.number;
  if (chapter.title !== undefined) result.title = chapter.title;
  if (chapter.translatedTitle !== undefined) result.translated_title = chapter.translatedTitle;
  if (chapter.originalText !== undefined) result.original_text = chapter.originalText;
  if (chapter.translatedText !== undefined) result.translated_text = chapter.translatedText;
  if (chapter.translatedChunks !== undefined) result.translated_chunks = chapter.translatedChunks;
  if (chapter.status !== undefined) result.status = chapter.status;
  if (chapter.translationMeta !== undefined) result.translation_meta = chapter.translationMeta;
  if (chapter.criticReport !== undefined) result.critic_report = chapter.criticReport;
  return result;
}

export function transformParagraphFromDB(row: Record<string, unknown>): Paragraph {
  const r = row as Record<string, unknown> & {
    id: string;
    index: number;
    original_text?: string;
    translated_text?: string;
    status: string;
    edited_at?: string;
    edited_by?: string;
  };
  return {
    id: r.id,
    index: r.index,
    originalText: r.original_text ?? '',
    translatedText: r.translated_text || undefined,
    status: r.status as ParagraphStatus,
    editedAt: r.edited_at || undefined,
    editedBy: (r.edited_by as 'ai' | 'user') || undefined,
  };
}

export function transformGlossaryEntryFromDB(row: Record<string, unknown>): GlossaryEntry {
  const r = row as Record<string, unknown> & {
    id: string;
    image_urls?: string[];
    image_url?: string;
    mentioned_in_chapters?: number[];
    [k: string]: unknown;
  };
  let imageUrls = (r.image_urls as string[]) || [];
  if (r.image_url && !imageUrls.includes(r.image_url as string)) {
    imageUrls = [r.image_url as string, ...imageUrls];
  }

  const mentionedInChapters = r.mentioned_in_chapters;
  const mentionedInChaptersArr =
    Array.isArray(mentionedInChapters) && mentionedInChapters.length > 0
      ? [...(mentionedInChapters as number[])].sort((a, b) => a - b)
      : undefined;

  const relatedEntryIds = r.related_entry_ids;
  const relatedEntryIdsArr =
    Array.isArray(relatedEntryIds) && relatedEntryIds.length > 0
      ? (relatedEntryIds as string[]).filter((id) => typeof id === 'string')
      : undefined;

  return {
    id: r.id,
    type: r.type as 'character' | 'location' | 'term',
    original: r.original as string,
    translated: r.translated as string,
    gender: (r.gender as GlossaryEntry['gender']) || undefined,
    declensions: r.declensions ? (r.declensions as GlossaryEntry['declensions']) : undefined,
    description: (r.description as string) || undefined,
    notes: (r.notes as string) || undefined,
    firstAppearance: (() => {
      const fa = r.first_appearance;
      if (fa == null) return undefined;
      const num = typeof fa === 'number' ? fa : parseInt(String(fa), 10);
      return Number.isNaN(num) ? undefined : num;
    })(),
    mentionedInChapters: mentionedInChaptersArr,
    relatedEntryIds: relatedEntryIdsArr,
    primaryLocationId: (r.primary_location_id as string) || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined,
    autoDetected: (r.auto_detected as boolean) || false,
  };
}

/** Escape % and _ for use in ilike pattern (literal match) */
export function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}
