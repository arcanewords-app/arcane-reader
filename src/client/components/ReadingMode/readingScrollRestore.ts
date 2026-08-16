/** Pure scroll-restore helpers for ReadingMode (unit-tested). */

export type RectLike = {
  top: number;
  bottom: number;
  height?: number;
};

export const SCROLL_CORRECTION_THRESHOLD_PX = 5;

/** Delta to apply so `target` top aligns under the header inside `container`. */
export function computeScrollCorrectionDelta(
  targetRect: RectLike,
  containerRect: RectLike,
  headerHeight: number
): number {
  return targetRect.top - containerRect.top - headerHeight;
}

export function shouldApplyScrollCorrection(
  delta: number,
  threshold = SCROLL_CORRECTION_THRESHOLD_PX
): boolean {
  return Math.abs(delta) > threshold;
}

/** First paragraph whose bottom is below the readable top edge; -1 if none. */
export function findFirstVisibleParagraphIndex(
  paragraphs: Array<{ bottom: number; paragraphIndex: number }>,
  readableTop: number
): number {
  for (const p of paragraphs) {
    if (p.bottom > readableTop) return p.paragraphIndex;
  }
  return -1;
}

export function computeReadableTop(containerTop: number, headerHeight: number): number {
  return containerTop + headerHeight;
}

/** Desired scrollTop to place target under header, clamped to scroll range. */
export function computeDesiredScrollTop(params: {
  scrollTopBefore: number;
  targetTop: number;
  containerTop: number;
  headerHeight: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const targetOffsetFromContentTop =
    params.scrollTopBefore + (params.targetTop - params.containerTop);
  const desired = targetOffsetFromContentTop - params.headerHeight;
  const maxScrollTop = Math.max(0, params.scrollHeight - params.clientHeight);
  return Math.max(0, Math.min(desired, maxScrollTop));
}

export function shouldSkipScrollToTopOnChapterChange(params: {
  currentChapterId?: string;
  initialChapterId?: string;
  initialParagraphIndex?: number;
}): boolean {
  return (
    !!params.currentChapterId &&
    params.initialChapterId === params.currentChapterId &&
    params.initialParagraphIndex !== undefined &&
    params.initialParagraphIndex > 0
  );
}

export function shouldSkipInitialParagraphRestore(params: {
  isPublicationMode: boolean;
  initialParagraphIndex?: number;
  currentChapterId?: string;
  initialChapterId?: string;
  hasAppliedInitialScroll: boolean;
}): boolean {
  return (
    !params.isPublicationMode ||
    params.initialParagraphIndex === undefined ||
    params.initialParagraphIndex <= 0 ||
    !params.currentChapterId ||
    params.currentChapterId !== params.initialChapterId ||
    params.hasAppliedInitialScroll
  );
}

/** Whether paragraph URL sync should run (publication mode, index > 0, not already synced). */
export function shouldSyncParagraphUrl(params: {
  isPublicationMode: boolean;
  paragraphIndex: number;
  lastSyncedParagraphIndex: number;
}): boolean {
  if (!params.isPublicationMode || params.paragraphIndex <= 0) return false;
  return params.lastSyncedParagraphIndex !== params.paragraphIndex;
}

export function shouldSkipRouteForSameUrl(currentUrl: string, nextUrl: string): boolean {
  return currentUrl === nextUrl;
}
