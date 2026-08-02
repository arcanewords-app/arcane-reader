import { useEffect, useCallback, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import type { RefObject } from 'preact';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import type { ReaderChapter } from './readingModeHelpers.js';

const SCROLL_RESTORE_DEBUG = false;

/** ResizeObserver-based correction for layout shift (fonts, images) after initial scroll. */
function startScrollCorrection(
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
    const delta = rect.top - containerRect.top - headerH;
    const readableTop = containerRect.top + headerH;
    const paragraphs = el.querySelectorAll<HTMLElement>('[data-paragraph-index]');
    let actualTopIdx = -1;
    for (const p of paragraphs) {
      if (p.getBoundingClientRect().bottom > readableTop) {
        actualTopIdx = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
        break;
      }
    }
    if (SCROLL_RESTORE_DEBUG) {
      console.log('[ReadingMode:scroll] ResizeObserver callback', {
        delta: Math.round(delta),
        rect: {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
        },
        containerRect: {
          top: Math.round(containerRect.top),
          bottom: Math.round(containerRect.bottom),
          height: Math.round(containerRect.height),
        },
        headerH: Math.round(headerH),
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        willApply: Math.abs(delta) > 5,
        actualTopParagraphIndex: actualTopIdx,
        targetParagraphIndex: parseInt(target.dataset.paragraphIndex ?? '-1', 10),
      });
    }
    if (Math.abs(delta) > 5) el.scrollTop += delta;
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
      if (!isPublicationMode || !currentChapter || paragraphIndex <= 0) return;
      if (lastSyncedParagraphUrlRef.current === paragraphIndex) return;
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
      if (current === url) {
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

  const shouldSkipScrollToTop =
    !!chapters[currentChapterIndex] &&
    initialChapterId === chapters[currentChapterIndex].id &&
    initialParagraphIndex !== undefined &&
    initialParagraphIndex > 0;

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
      const readableTop = containerRect.top + headerH;
      const paragraphs = container.querySelectorAll<HTMLElement>('[data-paragraph-index]');
      for (const p of paragraphs) {
        const pRect = p.getBoundingClientRect();
        if (pRect.bottom > readableTop) {
          const idx = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
          if (idx >= 0) {
            currentParagraphIndexRef.current = idx;
            if (paragraphUrlDebounceRef.current) clearTimeout(paragraphUrlDebounceRef.current);
            paragraphUrlDebounceRef.current = setTimeout(() => {
              syncParagraphUrl(idx);
            }, 400);
          }
          break;
        }
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
    const skip =
      !isPublicationMode ||
      initialParagraphIndex === undefined ||
      initialParagraphIndex <= 0 ||
      !currentChapter ||
      currentChapter.id !== initialChapterId ||
      hasAppliedInitialScrollRef.current;
    if (skip) {
      if (SCROLL_RESTORE_DEBUG && initialParagraphIndex !== undefined) {
        const reason = !isPublicationMode
          ? '!isPublicationMode'
          : initialParagraphIndex <= 0
            ? 'initialParagraphIndex<=0'
            : !currentChapter
              ? '!currentChapter'
              : currentChapter.id !== initialChapterId
                ? 'chapterId mismatch'
                : 'hasAppliedInitialScrollRef';
        console.log('[ReadingMode:scroll] Effect skipped', {
          reason,
          initialParagraphIndex,
          currentChapterId: currentChapter?.id,
          initialChapterId,
        });
      }
      return;
    }
    const el = contentRef.current;
    if (!el) return;

    const totalParagraphs = el.querySelectorAll('[data-paragraph-index]').length;
    if (SCROLL_RESTORE_DEBUG) {
      const headerHNow = headerRef.current?.getBoundingClientRect().height ?? 0;
      const currentCh = chapters[currentChapterIndex];
      console.log('[ReadingMode:scroll] Effect started', {
        initialParagraphIndex,
        initialChapterId,
        totalParagraphs,
        isLastParagraph: initialParagraphIndex === totalParagraphs - 1,
        chaptersCount: chapters.length,
        currentChapterIndex,
        currentChapterId: currentCh?.id,
        chapterIdMatch: currentCh?.id === initialChapterId,
        elScrollHeight: el.scrollHeight,
        elClientHeight: el.clientHeight,
        elScrollTop: el.scrollTop,
        headerH: Math.round(headerHNow),
        documentFontsStatus: document.fonts?.status,
      });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let fontsTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const target = el.querySelector<HTMLElement>(
        `[data-paragraph-index="${initialParagraphIndex}"]`
      );
      if (target) {
        if (SCROLL_RESTORE_DEBUG) {
          const rectNow = target.getBoundingClientRect();
          const containerRectNow = el.getBoundingClientRect();
          console.log('[ReadingMode:scroll] Target found (before fonts.ready)', {
            attempt,
            initialParagraphIndex,
            rectTop: Math.round(rectNow.top),
            containerRectTop: Math.round(containerRectNow.top),
            elScrollTop: el.scrollTop,
            elScrollHeight: el.scrollHeight,
            elClientHeight: el.clientHeight,
          });
        }
        hasAppliedInitialScrollRef.current = true;
        const fontsReadyStart = performance.now();
        Promise.race([
          document.fonts.ready,
          new Promise<void>((r) => {
            fontsTimeoutId = setTimeout(r, 800);
          }),
        ]).then(() => {
          if (SCROLL_RESTORE_DEBUG) {
            console.log('[ReadingMode:scroll] Fonts ready', {
              elapsedMs: Math.round(performance.now() - fontsReadyStart),
            });
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              const headerH = headerRef.current?.getBoundingClientRect().height ?? 0;
              const scrollTopBefore = el.scrollTop;
              const rect = target.getBoundingClientRect();
              const containerRect = el.getBoundingClientRect();

              const targetOffsetFromContentTop = scrollTopBefore + (rect.top - containerRect.top);
              const desiredScrollTop = targetOffsetFromContentTop - headerH;
              const maxScrollTop = el.scrollHeight - el.clientHeight;

              el.scrollTop = Math.max(0, Math.min(desiredScrollTop, maxScrollTop));
              const scrollTopAfter = el.scrollTop;

              const readableTop = el.getBoundingClientRect().top + headerH;
              const paragraphs = el.querySelectorAll<HTMLElement>('[data-paragraph-index]');
              let actualTopParagraphIndex = -1;
              for (const p of paragraphs) {
                const pRect = p.getBoundingClientRect();
                if (pRect.bottom > readableTop) {
                  actualTopParagraphIndex = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
                  break;
                }
              }

              if (SCROLL_RESTORE_DEBUG) {
                const spacer = el.querySelector<HTMLElement>('.reading-mode-spacer-top');
                const offsetChain: Array<{ tag: string; offsetTop: number }> = [];
                let p: HTMLElement | null = target;
                while (p && p !== el && offsetChain.length < 5) {
                  offsetChain.push({
                    tag: p.tagName + (p.className ? '.' + String(p.className).split(' ')[0] : ''),
                    offsetTop: p.offsetTop,
                  });
                  p = p.offsetParent as HTMLElement | null;
                }
                console.log('[ReadingMode:scroll] Scroll applied (manual)', {
                  headerH: Math.round(headerH),
                  rect: {
                    top: Math.round(rect.top),
                    bottom: Math.round(rect.bottom),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                  },
                  containerRect: {
                    top: Math.round(containerRect.top),
                    bottom: Math.round(containerRect.bottom),
                    width: Math.round(containerRect.width),
                    height: Math.round(containerRect.height),
                  },
                  rectMinusContainerTop: Math.round(rect.top - containerRect.top),
                  targetOffsetFromContentTop: Math.round(targetOffsetFromContentTop),
                  desiredScrollTop: Math.round(desiredScrollTop),
                  scrollTopBefore,
                  scrollTopAfter,
                  scrollHeight: el.scrollHeight,
                  clientHeight: el.clientHeight,
                  maxScrollTop,
                  targetOffsetTop: target.offsetTop,
                  targetOffsetParent: target.offsetParent?.className ?? null,
                  offsetChain,
                  spacerHeight: spacer?.offsetHeight ?? null,
                  windowScrollY: window.scrollY,
                  windowInnerHeight: window.innerHeight,
                });
                console.log('[ReadingMode:scroll] Verification: planned vs actual', {
                  expectedParagraphIndex: initialParagraphIndex,
                  actualTopParagraphIndex,
                  mismatch: actualTopParagraphIndex !== initialParagraphIndex,
                  readableTop: Math.round(readableTop),
                  targetRectTopAfterScroll: Math.round(target.getBoundingClientRect().top),
                  targetShouldBeAt: Math.round(readableTop),
                  scrollPositionSet: scrollTopAfter,
                  scrollPositionRequested: Math.round(desiredScrollTop),
                  scrollPositionClamped: scrollTopAfter !== Math.round(desiredScrollTop),
                });
                const targetIdx = initialParagraphIndex;
                const targetIdxEl = el.querySelector<HTMLElement>(
                  `[data-paragraph-index="${targetIdx}"]`
                );
                const targetRectAfter = targetIdxEl?.getBoundingClientRect();
                const sampleFirst = Array.from(paragraphs)
                  .slice(0, 5)
                  .map((p) => {
                    const r = p.getBoundingClientRect();
                    const idx = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
                    return {
                      idx,
                      top: Math.round(r.top),
                      bottom: Math.round(r.bottom),
                      height: Math.round(r.height),
                      offsetTop: p.offsetTop,
                    };
                  });
                const sampleAroundTarget = Array.from(paragraphs)
                  .filter((p) => {
                    const idx = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
                    return idx >= targetIdx - 2 && idx <= targetIdx + 2;
                  })
                  .map((p) => {
                    const r = p.getBoundingClientRect();
                    const idx = parseInt(p.dataset.paragraphIndex ?? '-1', 10);
                    return {
                      idx,
                      top: Math.round(r.top),
                      bottom: Math.round(r.bottom),
                      offsetTop: p.offsetTop,
                    };
                  });
                console.log('[ReadingMode:scroll] Layout sample', {
                  first5Paragraphs: sampleFirst,
                  paragraphsAroundTarget: sampleAroundTarget,
                  targetParagraph: targetIdx,
                  targetRectAfter: targetRectAfter
                    ? {
                        top: Math.round(targetRectAfter.top),
                        bottom: Math.round(targetRectAfter.bottom),
                        offsetTop: targetIdxEl?.offsetTop,
                      }
                    : null,
                  totalParagraphs: paragraphs.length,
                  spacerHeight: el.querySelector<HTMLElement>('.reading-mode-spacer-top')
                    ?.offsetHeight,
                  targetOffsetTop: targetIdxEl?.offsetTop,
                  expectedScrollForTargetAtTop: targetIdxEl
                    ? targetIdxEl.offsetTop - headerH
                    : null,
                  actualScrollSet: scrollTopAfter,
                });
              }
              startScrollCorrection(el, target, headerRef, () => cancelled);
            });
          });
        });
        return;
      }
      if (SCROLL_RESTORE_DEBUG && attempt < 2) {
        console.log('[ReadingMode:scroll] Target not found, retry', { attempt });
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
