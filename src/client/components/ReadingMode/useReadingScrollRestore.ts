import { useEffect, useCallback, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import type { RefObject } from 'preact';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import type { ReaderChapter } from './readingModeHelpers.js';
import {
  computeDesiredScrollTop,
  computeReadableTop,
  computeScrollCorrectionDelta,
  findFirstVisibleParagraphIndex,
  shouldApplyScrollCorrection,
  shouldSkipInitialParagraphRestore,
  shouldSkipRouteForSameUrl,
  shouldSkipScrollToTopOnChapterChange,
  shouldSyncParagraphUrl,
} from './readingScrollRestore.js';

const SCROLL_RESTORE_DEBUG = false;

/** ResizeObserver-based correction for layout shift (fonts, images) after initial scroll. */
export function startScrollCorrection(
  el: HTMLElement,
  target: HTMLElement,
  headerRef: { current: HTMLElement | null },
  isCancelled: () => boolean
): void {
  const contentWrapper = el.querySelector<HTMLElement>('.reading-mode-text');
  const observeTarget = contentWrapper ?? el;
  const ro = new ResizeObserver(() => {
    if (isCancelled()) {
      ro.disconnect();
      return;
    }
    const headerH = headerRef.current?.getBoundingClientRect().height ?? 0;
    const rect = target.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    const delta = computeScrollCorrectionDelta(rect, containerRect, headerH);
    const readableTop = computeReadableTop(containerRect.top, headerH);
    const paragraphs = el.querySelectorAll<HTMLElement>('[data-paragraph-index]');
    const actualTopIdx = findFirstVisibleParagraphIndex(
      Array.from(paragraphs).map((p) => ({
        bottom: p.getBoundingClientRect().bottom,
        paragraphIndex: parseInt(p.dataset.paragraphIndex ?? '-1', 10),
      })),
      readableTop
    );
    if (SCROLL_RESTORE_DEBUG) {
      console.log('[ReadingMode:scroll] ResizeObserver callback', {
        delta: Math.round(delta),
        willApply: shouldApplyScrollCorrection(delta),
        actualTopParagraphIndex: actualTopIdx,
        targetParagraphIndex: parseInt(target.dataset.paragraphIndex ?? '-1', 10),
      });
    }
    if (shouldApplyScrollCorrection(delta)) el.scrollTop += delta;
  });
  ro.observe(observeTarget);
  setTimeout(() => ro.disconnect(), 2000);
}

export interface UseReadingScrollRestoreOptions {
  contentRef: RefObject<HTMLDivElement | null>;
  headerRef: RefObject<HTMLDivElement | null>;
  headerHeight: number;
  isPublicationMode: boolean;
  publicationPath?: string;
  publicationId?: string;
  projectId?: string;
  currentChapter: ReaderChapter | undefined;
  currentChapterIndex: number;
  chapters: ReaderChapter[];
  initialChapterId?: string;
  initialParagraphIndex?: number;
  chapterContentMap: Record<string, string>;
  chapterContentLoading: boolean;
  lastSyncedParagraphUrlRef: { current: number };
  resetChromeOnChapterChange: () => void;
}

export function useReadingScrollRestore({
  contentRef,
  headerRef,
  headerHeight,
  isPublicationMode,
  publicationPath,
  publicationId,
  projectId,
  currentChapter,
  currentChapterIndex,
  chapters,
  initialChapterId,
  initialParagraphIndex,
  chapterContentMap,
  chapterContentLoading,
  lastSyncedParagraphUrlRef,
  resetChromeOnChapterChange,
}: UseReadingScrollRestoreOptions) {
  const currentParagraphIndexRef = useRef(0);
  const hasAppliedInitialScrollRef = useRef(false);
  const paragraphUrlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncParagraphUrl = useCallback(
    (paragraphIndex: number) => {
      if (
        !shouldSyncParagraphUrl({
          isPublicationMode,
          paragraphIndex,
          lastSyncedParagraphIndex: lastSyncedParagraphUrlRef.current,
        }) ||
        !currentChapter
      ) {
        return;
      }
      const url = buildReadingChapterUrl({
        isPublicationMode,
        publicationPath,
        publicationId,
        projectId,
        chapterId: currentChapter.id,
        paragraphIndex,
      });
      if (!url) return;
      const current = window.location.pathname + window.location.search;
      if (shouldSkipRouteForSameUrl(current, url)) {
        lastSyncedParagraphUrlRef.current = paragraphIndex;
        return;
      }
      lastSyncedParagraphUrlRef.current = paragraphIndex;
      route(url, true);
    },
    [
      isPublicationMode,
      publicationPath,
      publicationId,
      projectId,
      currentChapter,
      lastSyncedParagraphUrlRef,
    ]
  );

  // Reset scroll-restore guard when URL chapter changes (e.g. browser Back)
  useEffect(() => {
    hasAppliedInitialScrollRef.current = false;
  }, [initialChapterId]);

  const shouldSkipScrollToTop = shouldSkipScrollToTopOnChapterChange({
    currentChapterId: chapters[currentChapterIndex]?.id,
    initialChapterId,
    initialParagraphIndex,
  });

  // Scroll content area to top when chapter changes (skip when resuming to saved position)
  useEffect(() => {
    if (!contentRef.current) return;
    if (shouldSkipScrollToTop) return;
    contentRef.current.scrollTop = 0;
    resetChromeOnChapterChange();
  }, [contentRef, currentChapterIndex, shouldSkipScrollToTop, resetChromeOnChapterChange]);

  // Scroll-based paragraph position tracking (publication mode): update ref and sync URL
  useEffect(() => {
    if (!isPublicationMode || !contentRef.current) return;
    const container = contentRef.current;

    const updateParagraphIndex = () => {
      const headerH = headerRef.current
        ? headerRef.current.getBoundingClientRect().height
        : headerHeight;
      const containerRect = container.getBoundingClientRect();
      const readableTop = computeReadableTop(containerRect.top, headerH);
      const paragraphs = container.querySelectorAll<HTMLElement>('[data-paragraph-index]');
      const idx = findFirstVisibleParagraphIndex(
        Array.from(paragraphs).map((p) => ({
          bottom: p.getBoundingClientRect().bottom,
          paragraphIndex: parseInt(p.dataset.paragraphIndex ?? '-1', 10),
        })),
        readableTop
      );
      if (idx >= 0) {
        currentParagraphIndexRef.current = idx;
        if (paragraphUrlDebounceRef.current) clearTimeout(paragraphUrlDebounceRef.current);
        paragraphUrlDebounceRef.current = setTimeout(() => {
          syncParagraphUrl(idx);
        }, 400);
      }
    };

    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateParagraphIndex);
    };

    updateParagraphIndex();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
      if (paragraphUrlDebounceRef.current) clearTimeout(paragraphUrlDebounceRef.current);
    };
  }, [
    isPublicationMode,
    syncParagraphUrl,
    currentChapterIndex,
    chapterContentMap,
    chapterContentLoading,
    headerHeight,
    contentRef,
    headerRef,
  ]);

  // Scroll to initial paragraph when resuming (publication mode)
  useEffect(() => {
    const skip = shouldSkipInitialParagraphRestore({
      isPublicationMode,
      initialParagraphIndex,
      currentChapterId: currentChapter?.id,
      initialChapterId,
      hasAppliedInitialScroll: hasAppliedInitialScrollRef.current,
    });
    if (skip) {
      if (SCROLL_RESTORE_DEBUG && initialParagraphIndex !== undefined) {
        console.log('[ReadingMode:scroll] Effect skipped', {
          initialParagraphIndex,
          currentChapterId: currentChapter?.id,
          initialChapterId,
        });
      }
      return;
    }
    const el = contentRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let fontsTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const target = el.querySelector<HTMLElement>(
        `[data-paragraph-index="${initialParagraphIndex}"]`
      );
      if (target) {
        hasAppliedInitialScrollRef.current = true;
        Promise.race([
          document.fonts.ready,
          new Promise<void>((r) => {
            fontsTimeoutId = setTimeout(r, 800);
          }),
        ]).then(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              const headerH = headerRef.current?.getBoundingClientRect().height ?? 0;
              const scrollTopBefore = el.scrollTop;
              const rect = target.getBoundingClientRect();
              const containerRect = el.getBoundingClientRect();

              el.scrollTop = computeDesiredScrollTop({
                scrollTopBefore,
                targetTop: rect.top,
                containerTop: containerRect.top,
                headerHeight: headerH,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
              });

              startScrollCorrection(el, target, headerRef, () => cancelled);
            });
          });
        });
        return;
      }
      if (attempt < 2) {
        timeoutId = setTimeout(() => tryScroll(attempt + 1), 50);
      }
    };

    tryScroll(0);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (fontsTimeoutId !== undefined) clearTimeout(fontsTimeoutId);
    };
  }, [
    isPublicationMode,
    initialParagraphIndex,
    initialChapterId,
    currentChapter,
    chapterContentMap,
    contentRef,
    headerRef,
    chapters,
    currentChapterIndex,
  ]);

  return {
    currentParagraphIndexRef,
  };
}
