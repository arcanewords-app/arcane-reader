import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { Project, ProjectWithChapterList, ReaderSettings, GlossaryEntry } from '../../types';
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
import { ApiError } from '../../api/errors';
import { renderTextWithBlocks, mergeSegmentsWithUnclosedBlocks } from '../../utils/text-blocks';
import {
  clearBrowserSelection,
  formatReportPrefill,
  type ReadingSelectionAction,
} from '../../utils/readingSelection';
import { useReadingTextSelection } from '../../hooks/useReadingTextSelection';
import { ReadingSelectionToolbar } from './ReadingSelectionToolbar';
import { getAnchorFromSelection } from '../../utils/readingTextAnchors';
import {
  loadHighlights,
  subscribeHighlightsStorage,
  toggleHighlightForRange,
  type StoredHighlight,
} from '../../utils/readingHighlightsStorage';
import { applyHighlightsToContainer } from '../../utils/readingHighlightRender';
import { buildProfileUrl } from '../../utils/profileRoutes';
import { DEFAULT_TEXT_BLOCK_TYPES } from '../../constants/text-block-presets';
import { buildReadingChapterUrl } from '../../utils/readingRoutes';
import { RatePublicationModal } from '../Publication/RatePublicationModal';
import { dismissRatingNudge, isRatingNudgeDismissed } from '../../utils/publicationRatingNudge';
import { useReadingChapterNavigation } from './useReadingChapterNavigation.js';
import { useReadingChrome } from './useReadingChrome.js';
import { useReadingScrollRestore } from './useReadingScrollRestore.js';
import type { ReaderChapter } from './readingModeHelpers.js';
import './ReadingMode.css';
import {
  trackChapterComplete,
  trackReadingEngagement,
  trackReadingStart,
} from '../../utils/analytics';

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
  const [chapterHighlights, setChapterHighlights] = useState<StoredHighlight[]>([]);
  const [quoteToast, setQuoteToast] = useState<'saved' | 'failed' | 'limit' | null>(null);
  const [highlightNotice, setHighlightNotice] = useState<'storageFull' | null>(null);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateModalInitialScore, setRateModalInitialScore] = useState<number | null>(null);
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
  const [chapterContentMap, setChapterContentMap] = useState<Record<string, string>>(
    () => initialChapterContent ?? {}
  );
  const [chapterContentLoading, setChapterContentLoading] = useState(false);

  const isPublicationMode = !!publicationId;
  const lastSyncedParagraphUrlRef = useRef(-1);
  const scrolledToEndRef = useRef(false);
  const markedThisSessionRef = useRef<Set<string>>(new Set());
  const lastParagraphRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const reportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const readingStartTrackedRef = useRef<Set<string>>(new Set());
  const scrollDepthTrackedRef = useRef<Set<number>>(new Set());

  const hideSettingsOnScroll = useCallback(() => setShowSettings(false), []);

  const {
    chapters,
    currentChapterIndex,
    currentChapter,
    jumpConfirm,
    isOriginalReadingMode,
    navigateToChapterIndex,
    handlePrevChapter,
    handleJumpConfirm,
    handleJumpCancel,
    handleSelectChapter,
  } = useReadingChapterNavigation({
    isPublicationMode,
    publicationPath,
    publicationId,
    project,
    publicationChapters,
    initialChapterId,
    lastReadChapterNumber,
    onSetProgress,
    lastSyncedParagraphUrlRef,
    onAfterChapterSelect: () => setShowTOC(false),
  });

  const {
    headerRef,
    footerRef,
    menuVisible,
    headerHeight,
    footerHeight,
    headerVisible,
    footerVisible,
    resetOnChapterChange,
  } = useReadingChrome({
    contentRef,
    chaptersLength: chapters.length,
    currentChapterIndex,
    onHideSettings: hideSettingsOnScroll,
  });

  const { currentParagraphIndexRef } = useReadingScrollRestore({
    contentRef,
    headerRef,
    headerHeight,
    isPublicationMode,
    publicationPath,
    publicationId,
    projectId: project?.id,
    currentChapter,
    currentChapterIndex,
    chapters,
    initialChapterId,
    initialParagraphIndex,
    chapterContentMap,
    chapterContentLoading,
    lastSyncedParagraphUrlRef,
    resetChromeOnChapterChange: resetOnChapterChange,
  });

  // Merge initialChapterContent when it arrives (e.g. from preload in PublicationReadingPage)
  useEffect(() => {
    if (initialChapterContent && Object.keys(initialChapterContent).length > 0) {
      setChapterContentMap((prev) => ({ ...prev, ...initialChapterContent }));
    }
  }, [initialChapterContent]);

  const analyticsMode = isPublicationMode ? 'public' : 'author';
  const analyticsScopeId = isPublicationMode ? publicationId : project?.id;

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

  const handleExit = useCallback(() => {
    const ch = chapters[currentChapterIndex];
    onExit(ch?.id);
  }, [chapters, currentChapterIndex, onExit]);

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

  useEffect(() => {
    if (!isPublicationMode || !publicationId || !currentChapter || !isAuthenticated) {
      setChapterHighlights([]);
      return;
    }
    const userId = authService.getCachedUser()?.id;
    if (!userId) return;
    setChapterHighlights(loadHighlights(userId, publicationId, currentChapter.id));
  }, [isPublicationMode, publicationId, currentChapter?.id, isAuthenticated]);

  useEffect(() => {
    if (!isPublicationMode || !publicationId || !currentChapter) return;
    const userId = authService.getCachedUser()?.id;
    if (!userId) return;
    return subscribeHighlightsStorage(() => {
      setChapterHighlights(loadHighlights(userId, publicationId, currentChapter.id));
    });
  }, [isPublicationMode, publicationId, currentChapter?.id]);

  useEffect(() => {
    if (!quoteToast && !highlightNotice) return;
    const timer = window.setTimeout(() => {
      setQuoteToast(null);
      setHighlightNotice(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [quoteToast, highlightNotice]);

  const handleSaveQuote = useCallback(async () => {
    if (!publicationId || !currentChapter || !selectionState || !contentRef.current) return;
    const anchor = getAnchorFromSelection(contentRef.current, {
      publicationId,
      chapterId: currentChapter.id,
      chapterNumber: currentChapter.number,
    });
    if (!anchor) return;

    const quoteText = selectionState.text.trim().slice(0, 2000);
    if (!quoteText) return;

    try {
      await api.createPublicationQuote(publicationId, {
        chapterId: anchor.chapterId,
        chapterNumber: anchor.chapterNumber,
        quoteText,
        startParagraph: anchor.startParagraph,
        startOffset: anchor.startOffset,
        endParagraph: anchor.endParagraph,
        endOffset: anchor.endOffset,
      });
      setQuoteToast('saved');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LIMIT_REACHED') {
        setQuoteToast('limit');
      } else {
        setQuoteToast('failed');
      }
    } finally {
      clearSelection();
      clearBrowserSelection();
    }
  }, [publicationId, currentChapter, selectionState, clearSelection]);

  const handleToggleHighlight = useCallback(() => {
    if (!publicationId || !currentChapter || !selectionState || !contentRef.current) return;
    const userId = authService.getCachedUser()?.id;
    if (!userId) return;

    const anchor = getAnchorFromSelection(contentRef.current, {
      publicationId,
      chapterId: currentChapter.id,
      chapterNumber: currentChapter.number,
    });
    if (!anchor) return;

    const result = toggleHighlightForRange(
      userId,
      publicationId,
      currentChapter.id,
      anchor,
      selectionState.text
    );
    setChapterHighlights(result.highlights);
    if (result.storageFull) setHighlightNotice('storageFull');
    clearSelection();
    clearBrowserSelection();
  }, [publicationId, currentChapter, selectionState, clearSelection]);

  const selectionActions = useMemo<ReadingSelectionAction[]>(() => {
    if (!selectionState) return [];
    return [
      {
        id: 'quote',
        icon: 'format_quote',
        labelKey: 'readingMode.addQuoteAction',
        onClick: () => {
          void handleSaveQuote();
        },
      },
      {
        id: 'highlight',
        icon: 'ink_highlighter',
        labelKey: 'readingMode.toggleHighlightAction',
        onClick: handleToggleHighlight,
      },
      {
        id: 'report',
        icon: 'flag',
        labelKey: 'readingMode.reportSelectionAction',
        onClick: () => handleOpenReportModal(selectionState.text),
      },
    ];
  }, [selectionState, handleSaveQuote, handleToggleHighlight, handleOpenReportModal]);

  const displayText = currentChapter ? (chapterContentMap[currentChapter.id] ?? '') : '';
  const contentLoaded = currentChapter ? currentChapter.id in chapterContentMap : true;
  const isLoadingContent = chapterContentLoading || (currentChapter && !contentLoaded);

  const textBlockTypes = useMemo(
    () =>
      (project?.settings?.textBlockTypes?.length ?? 0) > 0
        ? (project?.settings?.textBlockTypes ?? [])
        : DEFAULT_TEXT_BLOCK_TYPES,
    [project?.settings?.textBlockTypes]
  );

  const paragraphElements = useMemo(() => {
    if (!displayText) return null;
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
  }, [displayText, textBlockTypes]);

  useLayoutEffect(() => {
    const textContainer = contentRef.current?.querySelector('.reading-mode-text');
    if (!(textContainer instanceof HTMLElement) || isLoadingContent) return;
    applyHighlightsToContainer(textContainer, chapterHighlights);
  }, [chapterHighlights, displayText, isLoadingContent]);

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
            paragraphElements
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

      {(quoteToast || highlightNotice) && (
        <div
          class={`reading-mode-action-toast${quoteToast === 'failed' || quoteToast === 'limit' || highlightNotice === 'storageFull' ? ' reading-mode-action-toast--error' : ''}`}
          role="status"
        >
          <span>
            {quoteToast === 'saved' && t('readingMode.quoteSaved')}
            {quoteToast === 'failed' && t('readingMode.quoteSaveFailed')}
            {quoteToast === 'limit' && t('readingMode.quoteLimitReached')}
            {highlightNotice === 'storageFull' && t('readingMode.highlightStorageFull')}
          </span>
          {quoteToast === 'saved' && (
            <button
              type="button"
              class="reading-mode-action-toast-link"
              onClick={() => route(buildProfileUrl('quotes'))}
            >
              {t('readingMode.quoteOpenProfile')}
            </button>
          )}
        </div>
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
