/**
 * Pure helpers extracted from ReadingMode for unit testing.
 */

/** Resolve chapter list index from URL chapter id; falls back to 0 when missing/invalid. */
export function resolveChapterIndexById(
  chapters: ReadonlyArray<{ id: string }>,
  chapterId: string | undefined
): number {
  if (!chapterId || chapters.length === 0) return 0;
  const idx = chapters.findIndex((ch) => ch.id === chapterId);
  return idx >= 0 ? idx : 0;
}

/** Whether URL chapter id matches the chapter currently shown (avoids redundant route sync). */
export function isSameChapterId(
  currentChapterId: string | undefined,
  urlChapterId: string | undefined
): boolean {
  if (!currentChapterId || !urlChapterId) return false;
  return currentChapterId === urlChapterId;
}
