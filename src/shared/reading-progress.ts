/**
 * Watermark reading progress — pure helpers.
 * ADR: docs/04-decisions/adr-reading-progress-watermark.md
 */

export interface ChapterProgressRef {
  id: string;
  number: number;
  hasTranslation?: boolean;
}

/** Chapter is read when its number is at or below the watermark. */
export function isChapterReadByWatermark(chapterNumber: number, watermark: number): boolean {
  return watermark > 0 && chapterNumber <= watermark;
}

/** Count chapters read under watermark (handles gaps in numbering). */
export function countReadChapters<T extends { number: number }>(
  chapters: T[],
  watermark: number
): number {
  if (watermark <= 0) return 0;
  return chapters.filter((ch) => ch.number <= watermark).length;
}

/** First chapter to continue: number > watermark with translation, sorted by number asc. */
export function resolveContinueChapter<T extends ChapterProgressRef>(
  chapters: T[],
  watermark: number
): T | null {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  return (
    sorted.find(
      (ch) => ch.number > watermark && (ch.hasTranslation === undefined || ch.hasTranslation)
    ) ?? null
  );
}

/** Whether opening chapter K should prompt skip-ahead confirmation. */
export function shouldConfirmJumpAhead(chapterNumber: number, watermark: number): boolean {
  return chapterNumber > watermark + 1;
}

/** Complete current chapter: advance watermark to at least chapterNumber. */
export function advanceWatermarkComplete(current: number, chapterNumber: number): number {
  return Math.max(current, chapterNumber);
}

/** Explicit set progress to chapter K. */
export function setWatermark(chapterNumber: number): number {
  return Math.max(0, chapterNumber);
}
