import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  ChapterListItem,
  ReaderSettings,
  GlossaryEntry,
} from '../../types';
import { LEGACY_FONT_MAP } from '../../types';
import { api } from '../../api/client';
import {
  AUTH_CHANGED_EVENT,
  authService,
  type AuthChangedDetail,
} from '../../services/authService';
import { ReaderSettingsPanel } from '../ChapterView/ReaderSettings';
import { PublicationGlossaryModal } from '../Glossary';
import { ChapterTocModal } from '../ChapterTocModal';
import { Modal, LoadingSpinner, Icon } from '../ui';
import { renderTextWithBlocks, mergeSegmentsWithUnclosedBlocks } from '../../utils/text-blocks';
import {
  clearBrowserSelection,
  formatReportPrefill,
  type ReadingSelectionAction,
} from '../../utils/readingSelection';
import { useReadingTextSelection } from '../../hooks/useReadingTextSelection';
import { ReadingSelectionToolbar } from './ReadingSelectionToolbar';
import { DEFAULT_TEXT_BLOCK_TYPES } from '../../constants/text-block-presets';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import { shouldConfirmJumpAhead } from '../../../shared/reading-progress';
import { RatePublicationModal } from '../Publication/RatePublicationModal';
import {
  trackChapterComplete,
  trackReadingEngagement,
  trackReadingStart,
} from '../../utils/analytics';

/** Chapter shape for reader: full Chapter (project) or minimal + loaded content (publication) */
type ReaderChapter =
  | (Chapter & { translatedText?: string })
  | { id: string; number: number; title: string; translatedText?: string };

interface ReadingModeProps {
  project?: Project | ProjectWithChapterList;
  /** Publication mode: show translated text from catalog */
  publicationId?: string;
  /** URL path segment for publication (slug or id). Use for share links and canonical URLs. */
  publicationPath?: string;
  publicationTitle?: string;
  publicationChapters?: Array<{ id: string; number: number; title: string }>;
  /** When > 0, show Glossary button in header (publication mode only). */
  publicationGlossaryCount?: number;
  /** Preloaded glossary entries (modal opens without loading when set). */
  publicationGlossaryPreloaded?: GlossaryEntry[] | null;
  initialChapterId?: string;
  /** Preloaded chapter content (chapterId -> text) for initial chapter when opening via direct link. */
  initialChapterContent?: Record<string, string>;
  onExit: (currentChapterId?: string) => void;
  /** Called when user completes a chapter (Next, last chapter scroll). Auth only. */
  onChapterComplete?: (chapterNumber: number) => void;
  /** Set or complete watermark (jump confirm, TOC mark). Auth only. */
  onSetProgress?: (chapterNumber: number, mode: 'complete' | 'set') => void;
  /** Paragraph index to scroll to on load (guest share URL only). */
  initialParagraphIndex?: number;
  /** Watermark: chapters with number <= N are read. */
  lastReadChapterNumber?: number;
}

const defaultReaderSettings: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: 'default',
  colorScheme: 'dark',
  textIndent: true,
  textAlign: 'justify',
  hideChapterHeader: false,
  paragraphSpacing: 0.5,
  containerWidth: 69,
};

const SCROLL_RESTORE_DEBUG = false; // set true to debug scroll restoration

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

export function ReadingMode({
  project,
  publicationId,
  publicationPath,
  publicationChapters = [],
  publicationGlossaryCount = 0,
  publicationGlossaryPreloaded,
  initialChapterId,
  initialChapterContent,
  onExit,
  onChapterComplete,
  onSetProgress,
  initialParagraphIndex,
  lastReadChapterNumber = 0,
}: ReadingModeProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [reportPrefilledFromSelection, setReportPrefilledFromSelection] = useState(false);
  const [reportSelectionTruncated, setReportSelectionTruncated] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateModalInitialScore, setRateModalInitialScore] = useState<number | null>(null);
  const [jumpConfirm, setJumpConfirm] = useState<{
    targetIndex: number;
    chapterNumber: number;
  } | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const raw = project?.settings?.reader;
    if (!raw) return { ...defaultReaderSettings };
    let fontFamily = raw.fontFamily ?? defaultReaderSettings.fontFamily;
    const legacy = LEGACY_FONT_MAP[fontFamily as keyof typeof LEGACY_FONT_MAP];
    if (legacy) fontFamily = legacy;
    return { ...defaultReaderSettings, ...raw, fontFamily };
  });
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [chapterContentMap, setChapterContentMap] = useState<Record<string, string>>(
    () => initialChapterContent ?? {}
  );
  const [chapterContentLoading, setChapterContentLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(true);
  const [isNearTop, setIsNearTop] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(80);
  const [footerHeight, setFooterHeight] = useState(80);

  const isPublicationMode = !!publicationId;
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollAccumRef = useRef(0);
  const scrollUpAccumRef = useRef(0);
  const scrollThreshold = 50;
  const scrollUpThreshold = 50;

  // Measure header/footer and sync spacer heights (immediate + ResizeObserver)
  const measureChrome = useCallback(() => {
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;
    if (headerEl) setHeaderHeight(Math.ceil(headerEl.getBoundingClientRect().height));
    if (footerEl) setFooterHeight(Math.ceil(footerEl.getBoundingClientRect().height));
  }, []);

  useLayoutEffect(() => {
    if (chapters.length === 0) return;
    measureChrome();
  }, [chapters.length, measureChrome]);

  useEffect(() => {
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;
    if (!headerEl || !footerEl || chapters.length === 0) return;

    const ro = new ResizeObserver(() => measureChrome());
    ro.observe(headerEl);
    ro.observe(footerEl);
    return () => ro.disconnect();
  }, [chapters.length, measureChrome]);

  // Merge initialChapterContent when it arrives (e.g. from preload in PublicationReadingPage)
  useEffect(() => {
    if (initialChapterContent && Object.keys(initialChapterContent).length > 0) {
      setChapterContentMap((prev) => ({ ...prev, ...initialChapterContent }));
    }
  }, [initialChapterContent]);

  // Read progress: scrolled to end (85%+), and already-marked set to avoid duplicate API calls
  const scrolledToEndRef = useRef(false);
  const markedThisSessionRef = useRef<Set<string>>(new Set());
  const lastParagraphRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const reportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentParagraphIndexRef = useRef(0);
  const hasAppliedInitialScrollRef = useRef(false);
  const paragraphUrlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedParagraphUrlRef = useRef(-1);
  const readingStartTrackedRef = useRef<Set<string>>(new Set());
  const scrollDepthTrackedRef = useRef<Set<number>>(new Set());

  const analyticsMode = isPublicationMode ? 'public' : 'author';
  const analyticsScopeId = isPublicationMode ? publicationId : project?.id;

  const currentChapter = chapters[currentChapterIndex];

  const syncChapterUrl = useCallback(
    (targetChapterId: string, replace = false) => {
      const url = buildReadingChapterUrl({
        isPublicationMode,
        publicationPath,
        publicationId,
        projectId: project?.id,
        chapterId: targetChapterId,
      });
      if (!url) return;
      if (
        typeof window !== 'undefined' &&
        window.location.pathname + window.location.search === url
      ) {
        return;
      }
      lastSyncedParagraphUrlRef.current = -1;
      route(url, replace);
    },
    [isPublicationMode, publicationPath, publicationId, project?.id]
  );

  const syncParagraphUrl = useCallback(
    (paragraphIndex: number) => {
      if (!isPublicationMode || !currentChapter || paragraphIndex <= 0) return;
      if (lastSyncedParagraphUrlRef.current === paragraphIndex) return;
      const url = buildReadingChapterUrl({
        isPublicationMode,
        publicationPath,
        publicationId,
        projectId: project?.id,
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
    [isPublicationMode, publicationPath, publicationId, project?.id, currentChapter]
  );

  /** Explicit "next chapter" — completes current chapter watermark. */
  const markCurrentChapterComplete = useCallback(() => {
    const ch = chapters[currentChapterIndex];
    if (!ch || !onChapterComplete) return;
    if (markedThisSessionRef.current.has(ch.id)) return;
    markedThisSessionRef.current.add(ch.id);
    onChapterComplete(ch.number);
    trackChapterComplete({
      mode: analyticsMode,
      publicationId,
      projectId: project?.id,
      chapterId: ch.id,
      chapterNumber: ch.number,
    });

    if (!publicationId || !authService.getToken() || isRatingNudgeDismissed(publicationId)) {
      return;
    }
    dismissRatingNudge(publicationId);
    void api.getPublicationRatingStatus(publicationId).then((status) => {
      if (status.eligibility === 'eligible' && status.userScore == null) {
        setRateModalInitialScore(null);
        setShowRateModal(true);
      }
    });
  }, [chapters, currentChapterIndex, onChapterComplete, publicationId, analyticsMode, project?.id]);

  useEffect(() => {
    if (!currentChapter || !analyticsScopeId) return;
    const scopeKey = `${analyticsMode}:${analyticsScopeId}`;
    if (readingStartTrackedRef.current.has(scopeKey)) return;
    readingStartTrackedRef.current.add(scopeKey);
    trackReadingStart({
      mode: analyticsMode,
      publicationId,
      projectId: project?.id,
      chapterId: currentChapter.id,
      chapterNumber: currentChapter.number,
    });
  }, [analyticsMode, analyticsScopeId, currentChapter, publicationId, project?.id]);

  useEffect(() => {
    scrollDepthTrackedRef.current.clear();
  }, [currentChapter?.id]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || !currentChapter) return;

    const thresholds = [25, 50, 75, 100] as const;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;
      const percent = Math.round((scrollTop / maxScroll) * 100);
      for (const threshold of thresholds) {
        if (percent < threshold || scrollDepthTrackedRef.current.has(threshold)) continue;
        scrollDepthTrackedRef.current.add(threshold);
        trackReadingEngagement({
          mode: analyticsMode,
          publicationId,
          projectId: project?.id,
          chapterId: currentChapter.id,
          scrollPercent: threshold,
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [
    analyticsMode,
    currentChapter,
    publicationId,
    project?.id,
    chapterContentMap,
    chapterContentLoading,
    currentChapterIndex,
  ]);

  const navigateToChapterIndex = useCallback(
    (newIndex: number, options?: { skipJumpConfirm?: boolean }) => {
      if (newIndex < 0 || newIndex >= chapters.length || newIndex === currentChapterIndex) return;
      const targetChapter = chapters[newIndex];
      if (!targetChapter) return;

      if (
        !options?.skipJumpConfirm &&
        isPublicationMode &&
        onSetProgress &&
        shouldConfirmJumpAhead(targetChapter.number, lastReadChapterNumber)
      ) {
        setJumpConfirm({ targetIndex: newIndex, chapterNumber: targetChapter.number });
        return;
      }

      setCurrentChapterIndex(newIndex);
      syncChapterUrl(targetChapter.id);
    },
    [
      chapters,
      currentChapterIndex,
      isPublicationMode,
      onSetProgress,
      lastReadChapterNumber,
      syncChapterUrl,
    ]
  );

  const selectionTrackingEnabled =
    isPublicationMode &&
    isAuthenticated &&
    !!currentChapter &&
    !showReportModal &&
    !showSettings &&
    !showTOC &&
    !showGlossary;

  const { selectionState, captureCurrentSelection, clearSelection } = useReadingTextSelection({
    enabled: selectionTrackingEnabled,
    containerRef: contentRef,
    resetKey: currentChapter?.id,
  });

  useEffect(() => {
    const handleAuthChanged = (e: CustomEvent<AuthChangedDetail>) => {
      setIsAuthenticated(e.detail.authenticated);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, []);

  // Determine reading mode (project mode only)
  const isOriginalReadingMode =
    !isPublicationMode && (project?.settings?.originalReadingMode ?? false);

  // Load user's saved reader settings when authenticated (user preferences override project/defaults)
  useEffect(() => {
    if (!isAuthenticated || readerSettingsLoaded) return;
    let cancelled = false;
    api
      .getUserReaderSettings()
      .then((userSettings) => {
        if (cancelled || !userSettings) return;
        setReaderSettings(userSettings);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReaderSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, readerSettingsLoaded]);

  // Track last synced initialChapterId so we don't reset index on parent re-renders (e.g. readChapterIds update)
  const lastInitialChapterIdRef = useRef<string | undefined>(undefined);

  // Publication mode: set chapters from catalog and initial index (own effect so project mode doesn't depend on publicationChapters reference)
  useEffect(() => {
    if (!isPublicationMode) return;
    const list: ReaderChapter[] = publicationChapters.map((ch) => ({ ...ch }));
    setChapters(list);
    if (list.length > 0) {
      // Only sync index when initialChapterId changed (URL navigation) or first mount. Do NOT reset when
      // parent re-renders (e.g. readChapterIds update) — publicationChapters gets new ref every render.
      const syncFromUrl = lastInitialChapterIdRef.current !== initialChapterId;
      if (syncFromUrl) {
        lastInitialChapterIdRef.current = initialChapterId;
        const idx = initialChapterId ? list.findIndex((ch) => ch.id === initialChapterId) : 0;
        setCurrentChapterIndex(idx >= 0 ? idx : 0);
      }
    }
  }, [isPublicationMode, publicationChapters, initialChapterId]);

  // Reset scroll-restore guard when URL chapter changes (e.g. browser Back)
  useEffect(() => {
    hasAppliedInitialScrollRef.current = false;
  }, [initialChapterId]);

  const initialJumpCheckedRef = useRef(false);
  useEffect(() => {
    if (!isPublicationMode || !onSetProgress || initialJumpCheckedRef.current) return;
    const ch = chapters[currentChapterIndex];
    if (!ch) return;
    initialJumpCheckedRef.current = true;
    if (shouldConfirmJumpAhead(ch.number, lastReadChapterNumber)) {
      setJumpConfirm({ targetIndex: currentChapterIndex, chapterNumber: ch.number });
    }
  }, [isPublicationMode, onSetProgress, chapters, currentChapterIndex, lastReadChapterNumber]);

  // Project mode: filter chapters from project (ChapterListItem - lightweight)
  useEffect(() => {
    if (isPublicationMode || !project) return;

    let availableChapters: ReaderChapter[];
    const projectChapters = project.chapters as ChapterListItem[];
    if (isOriginalReadingMode) {
      availableChapters = [...projectChapters].sort((a, b) => a.number - b.number);
    } else {
      availableChapters = projectChapters
        .filter(
          (ch) =>
            ch.hasTranslation ||
            ch.status === 'completed' ||
            ch.status === 'draft' ||
            ch.status === 'partial'
        )
        .sort((a, b) => a.number - b.number);
    }

    setChapters(availableChapters);
    if (availableChapters.length > 0) {
      const chapterIndex = initialChapterId
        ? availableChapters.findIndex((ch) => ch.id === initialChapterId)
        : 0;
      setCurrentChapterIndex(chapterIndex >= 0 ? chapterIndex : 0);
    }
  }, [isPublicationMode, project, initialChapterId, isOriginalReadingMode]);

  // Publication mode: load current chapter content
  // Skip fetch for initial chapter — parent (PublicationReadingPage) provides it via initialChapterContent
  useEffect(() => {
    if (!isPublicationMode || !publicationId || chapters.length === 0) return;
    const ch = chapters[currentChapterIndex];
    if (!ch || chapterContentMap[ch.id]) return;
    if (initialChapterId && ch.id === initialChapterId) return;

    setChapterContentLoading(true);
    api
      .getPublicationChapter(publicationId, ch.id)
      .then((data) => {
        setChapterContentMap((prev) => ({ ...prev, [data.id]: data.translatedText }));
      })
      .catch(() => {})
      .finally(() => setChapterContentLoading(false));
  }, [
    isPublicationMode,
    publicationId,
    chapters,
    currentChapterIndex,
    chapterContentMap,
    initialChapterId,
  ]);

  // Project mode: load current chapter content (lazy)
  useEffect(() => {
    if (isPublicationMode || !project || chapters.length === 0) return;
    const ch = chapters[currentChapterIndex];
    if (!ch || chapterContentMap[ch.id]) return;

    setChapterContentLoading(true);
    api
      .getChapter(project.id, ch.id)
      .then((fullChapter) => {
        const text = isOriginalReadingMode
          ? fullChapter.originalText || ''
          : (() => {
              const withTranslated =
                fullChapter.paragraphs &&
                fullChapter.paragraphs.length > 0 &&
                fullChapter.paragraphs.some((p) => p.translatedText?.trim());
              if (withTranslated) {
                return fullChapter
                  .paragraphs!.sort((a, b) => a.index - b.index)
                  .filter((p) => p.translatedText)
                  .map((p) => p.translatedText!)
                  .join('\n\n');
              }
              return fullChapter.translatedText || '';
            })();
        setChapterContentMap((prev) => ({ ...prev, [fullChapter.id]: text }));
      })
      .catch(() => {})
      .finally(() => setChapterContentLoading(false));
  }, [
    isPublicationMode,
    project,
    chapters,
    currentChapterIndex,
    chapterContentMap,
    isOriginalReadingMode,
  ]);

  // Preload adjacent chapters (prev, next) in background — does not block UI
  // Note: chapterContentMap intentionally excluded from deps — when current chapter loads,
  // we must NOT abort preload of adjacent chapters (would cause ERR_ABORTED)
  const chapterContentMapRef = useRef(chapterContentMap);
  chapterContentMapRef.current = chapterContentMap;

  useEffect(() => {
    if (chapters.length <= 1) return;

    const controller = new AbortController();
    const toPreload: ReaderChapter[] = [];
    if (currentChapterIndex > 0) toPreload.push(chapters[currentChapterIndex - 1]);
    if (currentChapterIndex < chapters.length - 1)
      toPreload.push(chapters[currentChapterIndex + 1]);

    const needPreload = toPreload.filter((ch) => !chapterContentMapRef.current[ch.id]);
    if (needPreload.length === 0) return;

    const runPreload = () => {
      needPreload.forEach((ch) => {
        if (controller.signal.aborted) return;

        if (isPublicationMode && publicationId) {
          api
            .getPublicationChapter(publicationId, ch.id, controller.signal)
            .then((data) => {
              if (controller.signal.aborted) return;
              setChapterContentMap((prev) => ({ ...prev, [data.id]: data.translatedText }));
            })
            .catch(() => {});
        } else if (project) {
          api
            .getChapter(project.id, ch.id, controller.signal)
            .then((fullChapter) => {
              if (controller.signal.aborted) return;
              const text = isOriginalReadingMode
                ? fullChapter.originalText || ''
                : (() => {
                    const withTranslated =
                      fullChapter.paragraphs &&
                      fullChapter.paragraphs.length > 0 &&
                      fullChapter.paragraphs.some((p) => p.translatedText?.trim());
                    if (withTranslated) {
                      return fullChapter
                        .paragraphs!.sort((a, b) => a.index - b.index)
                        .filter((p) => p.translatedText)
                        .map((p) => p.translatedText!)
                        .join('\n\n');
                    }
                    return fullChapter.translatedText || '';
                  })();
              setChapterContentMap((prev) => ({ ...prev, [fullChapter.id]: text }));
            })
            .catch(() => {});
        }
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(runPreload, { timeout: 500 });
      return () => {
        cancelIdleCallback(id);
        controller.abort();
      };
    }
    runPreload();
    return () => controller.abort();
  }, [
    chapters,
    currentChapterIndex,
    isPublicationMode,
    publicationId,
    project,
    isOriginalReadingMode,
  ]);

  // Reset "scrolled to end" flag when chapter changes
  useEffect(() => {
    scrolledToEndRef.current = false;
  }, [currentChapterIndex]);

  // Save position when navigating to a new chapter — removed (watermark model; see ADR).

  // Scroll-based paragraph position tracking (publication mode): update ref and sync URL.
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
  ]);

  // IntersectionObserver: auto-complete last chapter at 85% scroll
  useEffect(() => {
    if (!onChapterComplete || !isPublicationMode) return;
    const el = lastParagraphRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || entry.intersectionRatio < 0.85) return;
        scrolledToEndRef.current = true;

        const isLastChapter = currentChapterIndex >= chapters.length - 1;
        if (isLastChapter) {
          markCurrentChapterComplete();
        }
      },
      { threshold: 0.85, rootMargin: '0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [
    onChapterComplete,
    isPublicationMode,
    chapters,
    currentChapterIndex,
    chapterContentMap,
    chapterContentLoading,
    markCurrentChapterComplete,
  ]);

  // Apply reader settings as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-font-size', `${readerSettings.fontSize}px`);
    root.style.setProperty('--reader-line-height', `${readerSettings.lineHeight}`);
    root.style.setProperty(
      '--reader-paragraph-spacing',
      `${Math.max(0.5, readerSettings.paragraphSpacing ?? 0.5)}em`
    );
    root.style.setProperty('--reader-container-width', `${readerSettings.containerWidth ?? 69}%`);
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
    root.setAttribute('data-reader-indent', (readerSettings.textIndent ?? true) ? 'true' : 'false');
    root.setAttribute('data-reader-align', readerSettings.textAlign ?? 'justify');
    if (readerSettings.colorScheme === 'custom') {
      root.style.setProperty('--reader-bg', readerSettings.customBg ?? '#f2f2f3');
      root.style.setProperty('--reader-text', readerSettings.customText ?? '#212529');
    } else {
      root.style.removeProperty('--reader-bg');
      root.style.removeProperty('--reader-text');
    }

    return () => {
      root.removeAttribute('data-reader-font');
      root.removeAttribute('data-reader-theme');
      root.removeAttribute('data-reader-indent');
      root.removeAttribute('data-reader-align');
      root.style.removeProperty('--reader-font-size');
      root.style.removeProperty('--reader-line-height');
      root.style.removeProperty('--reader-paragraph-spacing');
      root.style.removeProperty('--reader-container-width');
      root.style.removeProperty('--reader-bg');
      root.style.removeProperty('--reader-text');
    };
  }, [readerSettings]);

  // Scroll content area to top when chapter changes (skip when resuming to saved position)
  const shouldSkipScrollToTop =
    chapters[currentChapterIndex] &&
    initialChapterId === chapters[currentChapterIndex].id &&
    initialParagraphIndex !== undefined &&
    initialParagraphIndex > 0;

  useEffect(() => {
    if (!contentRef.current) return;
    if (shouldSkipScrollToTop) return;
    contentRef.current.scrollTop = 0;
    lastScrollTopRef.current = 0;
    scrollAccumRef.current = 0;
    scrollUpAccumRef.current = 0;
    setMenuVisible(true);
    setIsNearTop(true);
    setIsNearBottom(false);
  }, [currentChapterIndex, shouldSkipScrollToTop]);

  // Scroll to initial paragraph when resuming (publication mode)
  // Waits for fonts.ready to avoid FOUT layout shift; ResizeObserver corrects for images
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

              // Manual scroll: target offset from content top = scrollTop + (rect.top - containerRect.top)
              const targetOffsetFromContentTop = scrollTopBefore + (rect.top - containerRect.top);
              const desiredScrollTop = targetOffsetFromContentTop - headerH;
              const maxScrollTop = el.scrollHeight - el.clientHeight;

              el.scrollTop = Math.max(0, Math.min(desiredScrollTop, maxScrollTop));
              const scrollTopAfter = el.scrollTop;

              // Verification: which paragraph is actually at top after scroll (same logic as updateParagraphIndex)
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
                  // Inputs
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
                  // Computed
                  rectMinusContainerTop: Math.round(rect.top - containerRect.top),
                  targetOffsetFromContentTop: Math.round(targetOffsetFromContentTop),
                  desiredScrollTop: Math.round(desiredScrollTop),
                  // Scroll state
                  scrollTopBefore,
                  scrollTopAfter,
                  scrollHeight: el.scrollHeight,
                  clientHeight: el.clientHeight,
                  maxScrollTop,
                  // Target DOM
                  targetOffsetTop: target.offsetTop,
                  targetOffsetParent: target.offsetParent?.className ?? null,
                  offsetChain,
                  spacerHeight: spacer?.offsetHeight ?? null,
                  // Viewport
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
                // Log paragraph positions: first 5, target, and neighbors
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
                  // Expected: target.offsetTop should roughly equal scrollTop + headerH for target to be at top
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
  ]);

  // Hide menu on scroll down, show on scroll up (mobile, tablet, desktop)
  // Depends on chapters.length so effect re-runs when chapters load (first chapter); otherwise
  // currentChapterIndex stays 0 and the listener would never attach on initial open.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let rafId: number;

    const edgeThreshold = 100;
    const handleScroll = () => {
      rafId = requestAnimationFrame(() => {
        const scrollTop = el.scrollTop;
        const delta = scrollTop - lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        const nearTop = scrollTop <= edgeThreshold;
        const nearBottom =
          el.scrollHeight <= el.clientHeight ||
          scrollTop + el.clientHeight >= el.scrollHeight - edgeThreshold;
        setIsNearTop(nearTop);
        setIsNearBottom(nearBottom);

        if (delta > 0) {
          scrollUpAccumRef.current = 0;
          scrollAccumRef.current += delta;
          if (scrollAccumRef.current > scrollThreshold) {
            setMenuVisible(false);
            setShowSettings(false);
            scrollAccumRef.current = 0;
          }
        } else if (delta < 0) {
          scrollAccumRef.current = 0;
          scrollUpAccumRef.current += Math.abs(delta);
          if (scrollUpAccumRef.current > scrollUpThreshold) {
            setMenuVisible(true);
            scrollUpAccumRef.current = 0;
          }
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [currentChapterIndex, chapters.length]);

  const handleExit = useCallback(() => {
    const ch = chapters[currentChapterIndex];
    onExit(ch?.id);
  }, [chapters, currentChapterIndex, onExit]);

  const handlePrevChapter = useCallback(() => {
    if (currentChapterIndex <= 0) return;
    navigateToChapterIndex(currentChapterIndex - 1);
  }, [currentChapterIndex, navigateToChapterIndex]);

  const handleNextChapter = useCallback(() => {
    markCurrentChapterComplete();
    if (currentChapterIndex >= chapters.length - 1) return;
    navigateToChapterIndex(currentChapterIndex + 1, { skipJumpConfirm: true });
  }, [chapters.length, currentChapterIndex, markCurrentChapterComplete, navigateToChapterIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings) {
        if (e.key === 'Escape') {
          setShowSettings(false);
        }
        return; // Don't navigate when settings are open
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevChapter();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextChapter();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, handlePrevChapter, handleNextChapter, handleExit]);

  const handleReaderSettingsChange = async (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...readerSettings, ...updates };
    setReaderSettings(newSettings);
    if (isAuthenticated) {
      api.updateUserReaderSettings(newSettings).catch(() => {});
    }
    if (!isPublicationMode && project) {
      await api.updateReaderSettings(project.id, newSettings);
    }
  };

  const handleShare = useCallback(() => {
    const currentChapter = chapters[currentChapterIndex];
    if (!currentChapter) return;

    const path = buildReadingChapterUrl({
      isPublicationMode,
      publicationPath,
      publicationId,
      projectId: project?.id,
      chapterId: currentChapter.id,
      paragraphIndex: currentParagraphIndexRef.current,
    });
    if (!path) return;

    setShareLink(`${window.location.origin}${path}`);
    setShowShareModal(true);
  }, [
    isPublicationMode,
    publicationPath,
    publicationId,
    project?.id,
    chapters,
    currentChapterIndex,
  ]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  }, [shareLink]);

  const handleReportSubmit = useCallback(async () => {
    if (!publicationId || !currentChapter) return;
    const desc = reportDescription.trim();
    if (desc.length < 5) {
      setReportError(t('readingMode.reportMinLength'));
      return;
    }
    if (desc.length > 5000) {
      setReportError(t('readingMode.reportMaxLength'));
      return;
    }
    setReportError(null);
    setReportSubmitting(true);
    try {
      await api.reportTranslation(publicationId, currentChapter.id, desc);
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportDescription('');
        setReportPrefilledFromSelection(false);
        setReportSelectionTruncated(false);
        setReportSuccess(false);
      }, 1500);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : t('common.retry'));
    } finally {
      setReportSubmitting(false);
    }
  }, [publicationId, currentChapter, reportDescription, t]);

  const handleOpenReportModal = useCallback(
    (prefillText?: string) => {
      setReportError(null);
      setReportSuccess(false);

      const captured = prefillText ?? captureCurrentSelection();
      if (captured) {
        setReportDescription(formatReportPrefill(captured));
        setReportPrefilledFromSelection(true);
        setReportSelectionTruncated(selectionState?.wasTruncated ?? false);
      } else {
        setReportDescription('');
        setReportPrefilledFromSelection(false);
        setReportSelectionTruncated(false);
      }

      clearSelection();
      clearBrowserSelection();
      setShowReportModal(true);
    },
    [captureCurrentSelection, clearSelection, selectionState?.wasTruncated]
  );

  const handleCaptureSelectionForReport = useCallback(() => {
    captureCurrentSelection();
  }, [captureCurrentSelection]);

  useEffect(() => {
    if (!showReportModal) return;
    requestAnimationFrame(() => {
      const textarea = reportTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    });
  }, [showReportModal]);

  const handleCloseReportModal = useCallback(() => {
    if (reportSubmitting) return;
    setShowReportModal(false);
    setReportError(null);
    setReportDescription('');
    setReportPrefilledFromSelection(false);
    setReportSelectionTruncated(false);
  }, [reportSubmitting]);

  const selectionActions = useMemo<ReadingSelectionAction[]>(() => {
    if (!selectionState) return [];
    return [
      {
        id: 'report',
        icon: 'flag',
        labelKey: 'readingMode.reportSelectionAction',
        onClick: () => handleOpenReportModal(selectionState.text),
      },
    ];
  }, [selectionState, handleOpenReportModal]);

  const handleJumpConfirm = useCallback(() => {
    if (!jumpConfirm) return;
    onSetProgress?.(jumpConfirm.chapterNumber, 'set');
    const target = chapters[jumpConfirm.targetIndex];
    if (target && jumpConfirm.targetIndex !== currentChapterIndex) {
      setCurrentChapterIndex(jumpConfirm.targetIndex);
      syncChapterUrl(target.id);
    }
    setJumpConfirm(null);
  }, [jumpConfirm, onSetProgress, chapters, currentChapterIndex, syncChapterUrl]);

  const handleJumpCancel = useCallback(() => {
    if (!jumpConfirm) return;
    setJumpConfirm(null);
  }, [jumpConfirm]);

  const handleSelectChapter = useCallback(
    (index: number) => {
      if (index === currentChapterIndex) {
        setShowTOC(false);
        return;
      }
      navigateToChapterIndex(index);
      setShowTOC(false);
      window.scrollTo(0, 0);
    },
    [currentChapterIndex, navigateToChapterIndex]
  );

  if (chapters.length === 0) {
    return (
      <div
        class="reading-mode"
        data-reader-font={readerSettings.fontFamily}
        data-reader-theme={readerSettings.colorScheme}
        data-reader-indent={(readerSettings.textIndent ?? true) ? 'true' : 'false'}
        data-reader-align={readerSettings.textAlign ?? 'justify'}
      >
        <div class="reading-mode-empty">
          <div class="reading-mode-empty-content">
            <h2 class="reading-mode-empty-title">
              {isPublicationMode
                ? t('readingMode.noChaptersForReading')
                : isOriginalReadingMode
                  ? t('readingMode.noChaptersForReading')
                  : t('readingMode.noTranslatedChapters')}
            </h2>
            <p class="reading-mode-empty-description">
              {isPublicationMode
                ? t('readingMode.noTranslatedChapters')
                : isOriginalReadingMode
                  ? t('readingMode.noOriginalChaptersForReading')
                  : t('readingMode.needTranslateOneChapter')}
            </p>
            <button class="reading-mode-exit-btn reading-mode-empty-back-btn" onClick={handleExit}>
              {isPublicationMode
                ? t('readingMode.backToPublication')
                : t('readingMode.backToProject')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get text: publication/project mode from chapterContentMap (lazy loaded)
  const getText = (chapter: ReaderChapter): string => {
    return chapterContentMap[chapter.id] ?? '';
  };

  const displayText = currentChapter ? getText(currentChapter) : '';
  // Show loading when content is not yet loaded (avoids flash of "no translation" before fetch starts)
  const contentLoaded = currentChapter ? currentChapter.id in chapterContentMap : true;
  const isLoadingContent = chapterContentLoading || (currentChapter && !contentLoaded);
  const headerVisible = menuVisible || isNearTop;
  const footerVisible = menuVisible || isNearBottom;

  return (
    <div
      class={`reading-mode${!menuVisible ? ' reading-mode-chrome-hidden' : ''}`}
      data-reader-font={readerSettings.fontFamily}
      data-reader-theme={readerSettings.colorScheme}
      data-reader-indent={(readerSettings.textIndent ?? true) ? 'true' : 'false'}
      data-reader-align={readerSettings.textAlign ?? 'justify'}
      data-header-visible={headerVisible ? 'true' : 'false'}
      data-footer-visible={footerVisible ? 'true' : 'false'}
    >
      {/* Header: back, chapter title (no work title), actions */}
      <div ref={headerRef} class="reading-mode-header">
        <div class="reading-mode-header-left">
          <button
            class="reading-mode-exit-btn"
            onClick={handleExit}
            title={t('readingMode.exitTitle')}
          >
            <Icon name="arrow_back" size="sm" /> {t('common.back')}
          </button>
          {!readerSettings.hideChapterHeader && (
            <div class="reading-mode-title">
              <span class="reading-mode-chapter-title">
                {currentChapter?.title ||
                  t('readingMode.chapterFallback', { n: currentChapterIndex + 1 })}
              </span>
              <span class="reading-mode-chapter-info">
                {t('readingMode.chapterOf', {
                  current: currentChapterIndex + 1,
                  total: chapters.length,
                })}
              </span>
            </div>
          )}
        </div>
        <div class="reading-mode-header-right">
          {isPublicationMode && publicationGlossaryCount > 0 && (
            <button
              class="reading-mode-header-btn"
              onClick={() => setShowGlossary(true)}
              title={t('sidebar.glossary')}
            >
              <Icon name="dictionary" />
            </button>
          )}
          {isPublicationMode && currentChapter && isAuthenticated && (
            <button
              class="reading-mode-header-btn"
              onPointerDown={handleCaptureSelectionForReport}
              onClick={() => handleOpenReportModal()}
              title={t('readingMode.reportTranslation')}
            >
              <Icon name="flag" />
            </button>
          )}
          <button
            class="reading-mode-header-btn"
            onClick={() => setShowTOC(true)}
            title={t('readingMode.toc')}
          >
            <Icon name="toc" />
          </button>
          <button
            class="reading-mode-header-btn"
            onClick={handleShare}
            title={t('readingMode.shareLink')}
          >
            <Icon name="share" />
          </button>
          <button
            class="reading-mode-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title={t('readingMode.settingsTitle')}
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>

      {/* Settings Panel with overlay - click outside to close */}
      {showSettings && (
        <div
          class="reading-mode-settings-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowSettings(false);
          }}
          role="button"
          tabIndex={-1}
          aria-label={t('readingMode.settingsTitle')}
        >
          <div class="reading-mode-settings-panel">
            <ReaderSettingsPanel settings={readerSettings} onChange={handleReaderSettingsChange} />
          </div>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        class="reading-mode-content"
        style={{ paddingBottom: `${Math.max(0, footerHeight - 20)}px` }}
      >
        <div class="reading-mode-spacer-top" style={{ minHeight: `${headerHeight}px` }} />
        <div class="reading-mode-text">
          {isLoadingContent ? (
            <div class="reading-mode-content-loading">
              <LoadingSpinner size="md" text={t('common.loading')} />
            </div>
          ) : displayText ? (
            (() => {
              const textBlockTypes =
                (project?.settings?.textBlockTypes?.length ?? 0) > 0
                  ? (project?.settings?.textBlockTypes ?? [])
                  : DEFAULT_TEXT_BLOCK_TYPES;
              const segments = mergeSegmentsWithUnclosedBlocks(displayText);
              return segments.map((segment, idx) => (
                <div
                  key={idx}
                  ref={idx === segments.length - 1 ? lastParagraphRef : undefined}
                  class="reading-mode-paragraph"
                  data-paragraph-index={idx}
                  dangerouslySetInnerHTML={{
                    __html: renderTextWithBlocks(segment, textBlockTypes),
                  }}
                />
              ));
            })()
          ) : (
            <p class="reading-mode-empty-text">
              {isPublicationMode
                ? t('readingMode.noTranslatedText')
                : isOriginalReadingMode
                  ? t('readingMode.noOriginalText')
                  : t('readingMode.noTranslatedText')}
            </p>
          )}
        </div>
      </div>

      {selectionTrackingEnabled && selectionState && selectionActions.length > 0 && (
        <ReadingSelectionToolbar rect={selectionState.rect} actions={selectionActions} />
      )}

      {/* Bottom Navigation - prev/next in row, centered */}
      <div ref={footerRef} class="reading-mode-footer">
        <button
          class="reading-mode-footer-btn"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          title={t('chapter.prevChapter')}
        >
          <Icon name="chevron_left" />
        </button>
        <button
          class="reading-mode-footer-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
          title={t('chapter.nextChapter')}
        >
          <Icon name="chevron_right" />
        </button>
      </div>

      <ChapterTocModal
        isOpen={showTOC}
        onClose={() => setShowTOC(false)}
        chapters={chapters.map((ch) => ({
          id: ch.id,
          number: ch.number,
          title: ch.title ?? '',
        }))}
        currentChapterId={currentChapter?.id}
        lastReadChapterNumber={lastReadChapterNumber}
        onSetProgressToChapter={onSetProgress ? (num) => onSetProgress(num, 'set') : undefined}
        onSelectChapter={(chapterId) => {
          const index = chapters.findIndex((ch) => ch.id === chapterId);
          if (index >= 0) {
            handleSelectChapter(index);
          }
        }}
      />

      <Modal
        className="reading-share-modal"
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareCopied(false);
        }}
        title={t('readingMode.shareLink')}
        footer={
          <button
            class="reading-share-copy-btn"
            onClick={handleCopyShareLink}
            data-copied={shareCopied ? 'true' : 'false'}
          >
            {shareCopied ? (
              <>
                <Icon name="check" size="sm" /> {t('readingMode.copied')}!
              </>
            ) : (
              <>
                <Icon name="content_copy" size="sm" /> {t('readingMode.copyLink')}
              </>
            )}
          </button>
        }
      >
        <div class="reading-share-modal-content">
          <p class="reading-share-modal-label">{t('readingMode.linkLabel')}</p>
          <input type="text" value={shareLink} readOnly class="reading-share-modal-input" />
        </div>
      </Modal>

      <Modal
        className="reading-report-modal"
        isOpen={showReportModal}
        onClose={handleCloseReportModal}
        title={t('readingMode.reportTranslation')}
        footer={
          <div class="reading-report-modal-footer">
            <button
              class="reading-report-cancel-btn"
              onClick={handleCloseReportModal}
              disabled={reportSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button
              class="reading-report-submit-btn"
              onClick={handleReportSubmit}
              disabled={reportSubmitting || reportDescription.trim().length < 5}
            >
              {reportSubmitting ? (
                <LoadingSpinner size="sm" />
              ) : reportSuccess ? (
                <>
                  <Icon name="check" size="sm" /> {t('readingMode.reportSent')}
                </>
              ) : (
                t('readingMode.reportSubmit')
              )}
            </button>
          </div>
        }
      >
        <div class="reading-report-modal-content">
          {currentChapter && (
            <p class="reading-report-modal-chapter">
              {t('readingMode.reportChapter', {
                title:
                  currentChapter.title ||
                  t('readingMode.chapterFallback', { n: currentChapter.number }),
              })}
            </p>
          )}
          <label class="reading-report-modal-label" for="report-description">
            {t('readingMode.reportDescriptionLabel')}
          </label>
          {reportPrefilledFromSelection && (
            <p class="reading-report-modal-prefill-hint">
              {t('readingMode.reportSelectedFragment')}
            </p>
          )}
          <textarea
            ref={reportTextareaRef}
            id="report-description"
            class="reading-report-modal-textarea"
            value={reportDescription}
            onInput={(e) => setReportDescription((e.target as HTMLTextAreaElement).value)}
            placeholder={t('readingMode.reportPlaceholder')}
            rows={4}
            maxLength={5000}
            disabled={reportSubmitting}
          />
          <p class="reading-report-modal-hint">
            {reportSelectionTruncated
              ? `${t('readingMode.reportHint')} ${t('readingMode.reportSelectionTruncated')}`
              : t('readingMode.reportHint')}
          </p>
          {reportError && <p class="reading-report-modal-error">{reportError}</p>}
        </div>
      </Modal>

      {publicationId && (
        <PublicationGlossaryModal
          isOpen={showGlossary}
          onClose={() => setShowGlossary(false)}
          publicationId={publicationId}
          chapters={publicationChapters}
          preloadedEntries={publicationGlossaryPreloaded ?? undefined}
        />
      )}

      {publicationId && (
        <RatePublicationModal
          isOpen={showRateModal}
          onClose={() => setShowRateModal(false)}
          initialScore={rateModalInitialScore}
          onSave={async (score) => {
            await api.upsertPublicationRating(publicationId, score);
            setShowRateModal(false);
          }}
        />
      )}

      <Modal
        isOpen={jumpConfirm != null}
        onClose={handleJumpCancel}
        title={t('readingProgress.jumpConfirmTitle')}
        footer={
          <>
            <button type="button" class="btn btn-secondary" onClick={handleJumpCancel}>
              {t('readingProgress.jumpConfirmNo')}
            </button>
            <button type="button" class="btn btn-primary" onClick={handleJumpConfirm}>
              {t('readingProgress.jumpConfirmYes')}
            </button>
          </>
        }
      >
        <p>
          {t('readingProgress.jumpConfirmBody', {
            chapter: jumpConfirm?.chapterNumber ?? '',
          })}
        </p>
      </Modal>
    </div>
  );
}
