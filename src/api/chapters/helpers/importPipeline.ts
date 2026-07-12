/**
 * Shared import pipeline helpers — extracted from chapters routes (async job + sync POST).
 */

import type { ProjectType } from '../../../storage/database.js';
import { getProjectTypeFromFormat } from '../../../services/import/project-type.js';
import type { ImportFormat } from '../../../services/import/types.js';

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
  bucket: string,
  path: string,
  data: Buffer,
  options: { contentType: string }
) => Promise<{ publicUrl: string }>;

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
  uploadFileFn: UploadFileFn
): Promise<Record<string, unknown>> {
  const updated = { ...metadata };
  try {
    const storagePath = buildCoverStoragePath(projectId, coverImage.mimeType);
    const uploadResult = await uploadFileFn('images', storagePath, coverImage.data, {
      contentType: coverImage.mimeType,
    });
    updated.coverImageUrl = uploadResult.publicUrl;
  } catch {
    // Caller logs cover upload failures.
  }
  delete updated.coverImage;
  return updated;
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
