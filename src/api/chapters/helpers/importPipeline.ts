/**
 * Shared import pipeline helpers — extracted from chapters routes (async job + sync POST).
 */

import type { ProjectType } from '../../../storage/database.js';
import { getProjectTypeFromFormat } from '../../../services/import/project-type.js';
import type { ImportFormat } from '../../../services/import/types.js';
import type { StorageBucket } from '../../../services/storage.js';

function buildCoverStoragePath(projectId: string, mimeType: string): string {
  const ext = mimeType.split('/')[1] || 'jpg';
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  return `${projectId}/cover-${timestamp}-${random}.${ext}`;
}

export const CHAPTER_COUNT_WARN_THRESHOLD = 500;

export type ImportChapterBatchItem = { title: string; originalText: string };

export type ImportChapterBatchRow = {
  sourceIndex: number;
  chapterId: string;
  number: number;
  title: string;
  paragraphsCount: number;
};

export type ImportChaptersBatchFn = (
  projectId: string,
  batch: ImportChapterBatchItem[],
  token: string,
  options?: { useServiceRole?: boolean }
) => Promise<ImportChapterBatchRow[]>;

export interface CoverImageLike {
  data: Buffer;
  mimeType: string;
}

export type UploadFileFn = (
  bucket: StorageBucket,
  path: string,
  data: Buffer,
  options?: { contentType?: string }
) => Promise<{ publicUrl: string }>;

export type CoverPathBuilder = (projectId: string, mimeType: string) => string;

function defaultCoverPathBuilder(projectId: string, mimeType: string): string {
  return buildCoverStoragePath(projectId, mimeType);
}

function isCoverImageLike(value: unknown): value is CoverImageLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CoverImageLike;
  return Buffer.isBuffer(candidate.data) && typeof candidate.mimeType === 'string';
}

/** Whether first-chapter import should set project type from file format. */
export function shouldUpdateProjectType(
  currentType: ProjectType | undefined | null,
  detectedType: ProjectType
): boolean {
  return !currentType || (currentType === 'text' && detectedType !== 'text');
}

export function detectProjectTypeFromFormat(format: ImportFormat): ProjectType {
  return getProjectTypeFromFormat(format);
}

export function mergeImportMetadata(
  projectMetadata: Record<string, unknown> | undefined,
  parsedMetadata: Record<string, unknown>
): Record<string, unknown> {
  return { ...(projectMetadata || {}), ...parsedMetadata };
}

export function importMetadataChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>
): boolean {
  return JSON.stringify(after) !== JSON.stringify(before || {});
}

/** Upload cover to storage and strip inline coverImage from metadata. */
export async function applyCoverImageToMetadata(
  metadata: Record<string, unknown>,
  coverImage: CoverImageLike,
  projectId: string,
  uploadFileFn: UploadFileFn,
  options?: {
    buildCoverPath?: CoverPathBuilder;
    onCoverError?: (err: unknown) => void;
    onCoverSaved?: (storagePath: string) => void;
  }
): Promise<Record<string, unknown>> {
  const buildCoverPath = options?.buildCoverPath ?? defaultCoverPathBuilder;
  const updated = { ...metadata };
  try {
    const storagePath = buildCoverPath(projectId, coverImage.mimeType);
    const uploadResult = await uploadFileFn('images', storagePath, coverImage.data, {
      contentType: coverImage.mimeType,
    });
    updated.coverImageUrl = uploadResult.publicUrl;
    options?.onCoverSaved?.(storagePath);
  } catch (err) {
    options?.onCoverError?.(err);
  }
  delete updated.coverImage;
  return updated;
}

export interface ResolveImportMetadataOptions {
  onCoverError?: (err: unknown) => void;
  onCoverSaved?: (storagePath: string) => void;
  buildCoverPath?: CoverPathBuilder;
}

function toMetadataRecord(value: object | undefined): Record<string, unknown> | undefined {
  return value as Record<string, unknown> | undefined;
}

/** Merge parsed book metadata, optionally upload cover; null if no update needed. */
export async function resolveImportMetadataUpdate(
  projectMetadata: object | undefined,
  parsedMetadata: object | undefined,
  projectId: string,
  uploadFileFn: UploadFileFn,
  options?: ResolveImportMetadataOptions
): Promise<Record<string, unknown> | null> {
  const parsed = toMetadataRecord(parsedMetadata);
  if (!parsed || Object.keys(parsed).length === 0) {
    return null;
  }

  const before = toMetadataRecord(projectMetadata);
  let merged = mergeImportMetadata(before, parsed);
  const coverImage = parsed.coverImage;
  if (isCoverImageLike(coverImage)) {
    merged = await applyCoverImageToMetadata(merged, coverImage, projectId, uploadFileFn, {
      buildCoverPath: options?.buildCoverPath,
      onCoverError: options?.onCoverError,
      onCoverSaved: options?.onCoverSaved,
    });
  }

  if (!importMetadataChanged(before, merged)) {
    return null;
  }

  return merged;
}

export function appendChapterCountWarning(
  warnings: string[],
  chapterCount: number,
  threshold = CHAPTER_COUNT_WARN_THRESHOLD
): string[] {
  if (chapterCount <= threshold) return warnings;
  return [
    ...warnings,
    `Файл содержит ${chapterCount} глав. Рекомендуется разбить на части для лучшей производительности.`,
  ];
}

export async function flushImportBatch(
  importChaptersBatchFn: ImportChaptersBatchFn,
  projectId: string,
  batch: ImportChapterBatchItem[],
  token: string,
  options?: { useServiceRole?: boolean }
): Promise<ImportChapterBatchRow[]> {
  if (batch.length === 0) return [];
  return importChaptersBatchFn(projectId, batch, token, options);
}

export function buildRecentChapterSnapshotEntries(
  firstChapterNumber: number,
  titles: string[]
): Array<{ number: number; title: string }> {
  return titles.map((title, index) => ({
    number: firstChapterNumber + index,
    title,
  }));
}

export function appendRecentChapterSnapshot(
  recent: Array<{ number: number; title: string }>,
  entries: Array<{ number: number; title: string }>,
  maxSnapshot: number
): Array<{ number: number; title: string }> {
  let result = recent;
  for (const entry of entries) {
    result = result.length >= maxSnapshot ? [...result.slice(1), entry] : [...result, entry];
  }
  return result;
}

export function buildMultiChapterImportResponse(
  importedRows: ImportChapterBatchRow[],
  warnings?: string[]
): {
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    originalText: string;
    status: 'pending';
    paragraphs: [];
  }>;
  count: number;
  warnings?: string[];
} {
  return {
    chapters: importedRows.map((row) => ({
      id: row.chapterId,
      number: row.number,
      title: row.title,
      originalText: '',
      status: 'pending' as const,
      paragraphs: [],
    })),
    count: importedRows.length,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  };
}
