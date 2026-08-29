/**
 * Chapter PostgREST select lists.
 * `original_text`, `translated_chunks`, and `critic_report` live in TOAST;
 * omit them unless the caller needs recovery, clone, or the editor.
 */

export const CHAPTER_COLUMNS = {
  /** Catalog cache + metadata. No original_text, translated_chunks, critic_report. */
  core: 'id, number, title, translated_title, translated_text, status, translation_meta, created_at, updated_at',
  /** Bulk load with chunk auto-recovery. Still skips original_text and critic_report. */
  recovery:
    'id, number, title, translated_title, translated_text, translated_chunks, status, translation_meta, created_at, updated_at',
  /** Single-chapter editor, clone, transfer. */
  full: '*',
} as const;

export type ChapterColumnSet = keyof typeof CHAPTER_COLUMNS;

export function chapterSelect(columns: ChapterColumnSet = 'recovery'): string {
  return CHAPTER_COLUMNS[columns];
}

/** PostgREST types a dynamic `.select(string)` as GenericStringError; we already checked `error`. */
export function asChapterRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  return data as Record<string, unknown>[];
}
