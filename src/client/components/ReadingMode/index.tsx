import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
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
import { authService } from '../../services/authService';
import { ReaderSettingsPanel } from '../ChapterView/ReaderSettings';
import { PublicationGlossaryModal } from '../Glossary';
import { ChapterTocModal } from '../ChapterTocModal';
import { Modal, LoadingSpinner } from '../ui';
import { renderTextWithBlocks, mergeSegmentsWithUnclosedBlocks } from '../../utils/text-blocks';
import { DEFAULT_TEXT_BLOCK_TYPES } from '../../constants/text-block-presets';
import './ReadingMode.css';

/** Chapter shape for reader: full Chapter (project) or minimal + loaded content (publication) */
type ReaderChapter =
  | (Chapter & { translatedText?: string })
  | { id: string; number: number; title: string; translatedText?: string };

interface ReadingModeProps {
  project?: Project | ProjectWithChapterList;
  /** Publication mode: show translated text from catalog */
  publicationId?: string;
  publicationTitle?: string;
  publicationChapters?: Array<{ id: string; number: number; title: string }>;
  /** When > 0, show Glossary button in header (publication mode only). */
  publicationGlossaryCount?: number;
  /** Preloaded glossary entries (modal opens without loading when set). */
  publicationGlossaryPreloaded?: GlossaryEntry[] | null;
  initialChapterId?: string;
  /** Preloaded chapter content (chapterId -> text) for initial chapter when opening via direct link. */
  initialChapterContent?: Record<string, string>;
  onExit: () => void;
  /** Called when user has read chapter (scrolled to 85%+ and pressed Next, or last chapter scrolled to 85%+). Auth only. */
  onChapterRead?: (chapterId: string) => void;
  /** Called to save reading position (chapter + paragraph index). Auth only. */
  onSavePosition?: (chapterId: string, paragraphIndex: number) => void;
  /** Paragraph index to scroll to on load (resume). Publication mode only. */
  initialParagraphIndex?: number;
  /** Set of chapter IDs marked as read (for TOC indicator). */
  readChapterIds?: Set<string>;
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
  publicationTitle,
  publicationChapters = [],
  publicationGlossaryCount = 0,
  publicationGlossaryPreloaded,
  initialChapterId,
  initialChapterContent,
  onExit,
  onChapterRead,
  onSavePosition,
  initialParagraphIndex,
  readChapterIds,
}: ReadingModeProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const raw = project?.settings?.reader;
    if (!raw) return { ...defaultReaderSettings };
    let fontFamily = raw.fontFamily ?? defaultReaderSettings.fontFamily;
    const legacy = LEGACY_FONT_MAP[fontFamily as keyof typeof LEGACY_FONT_MAP];
    if (legacy) fontFamily = legacy;
    return { ...defaultReaderSettings, ...raw, fontFamily };
  });
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);
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
  const currentParagraphIndexRef = useRef(0);
  const hasAppliedInitialScrollRef = useRef(false);

  const currentChapter = chapters[currentChapterIndex];

  // Determine reading mode (project mode only)
  const isOriginalReadingMode =
    !isPublicationMode && (project?.settings?.originalReadingMode ?? false);

  // Load user's saved reader settings when authenticated (user preferences override project/defaults)
  useEffect(() => {
    if (!authService.isAuthenticated() || readerSettingsLoaded) return;
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
  }, [readerSettingsLoaded]);

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

  // Project mode: filter chapters from project (ChapterListItem - lightweight)
  useEffect(() => {
    if (isPublicationMode || !project) return;

    let availableChapters: ReaderChapter[];
    const projectChapters = project.chapters as ChapterListItem[];
    if (isOriginalReadingMode) {
      availableChapters = [...projectChapters].sort((a, b) => a.number - b.number);
    } else {
      availableChapters = projectChapters
        .filter((ch) => ch.hasTranslation || ch.status === 'completed' || ch.status === 'draft')
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
  }, [isPublicationMode, publicationId, chapters, currentChapterIndex, chapterContentMap, initialChapterId]);

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

  // Save position when navigating to a new chapter (publication mode) - skip initial mount
  // Note: use currentChapter?.id instead of currentChapter to avoid re-runs on every render
  // (currentChapter is derived from chapters.map which creates new refs each render)
  const isInitialChapterMountRef = useRef(true);
  useEffect(() => {
    if (!onSavePosition || !isPublicationMode || !currentChapter) return;
    if (isInitialChapterMountRef.current) {
      isInitialChapterMountRef.current = false;
      return;
    }
    onSavePosition(currentChapter.id, 0);
  }, [currentChapterIndex, isPublicationMode, currentChapter?.id, onSavePosition]);

  // IntersectionObserver: track current paragraph for save-on-leave
  useEffect(() => {
    if (!onSavePosition || !isPublicationMode || !contentRef.current) return;
    const container = contentRef.current;
    const paragraphs = container.querySelectorAll('[data-paragraph-index]');
    if (paragraphs.length === 0) return;

    const visibleIndices = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = parseInt((entry.target as HTMLElement).dataset.paragraphIndex ?? '-1', 10);
          if (idx >= 0) {
            if (entry.intersectionRatio > 0.5) {
              visibleIndices.add(idx);
            } else {
              visibleIndices.delete(idx);
            }
          }
        }
        const max = visibleIndices.size > 0 ? Math.max(...visibleIndices) : 0;
        currentParagraphIndexRef.current = max;
      },
      { threshold: 0.5, root: container }
    );

    paragraphs.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [
    onSavePosition,
    isPublicationMode,
    currentChapterIndex,
    chapterContentMap,
    chapterContentLoading,
  ]);

  // visibilitychange: save position when user switches tab (debounce 400ms)
  useEffect(() => {
    if (!onSavePosition || !isPublicationMode || !currentChapter) return;
    const chapterId = currentChapter.id;
    let timeoutId: ReturnType<typeof setTimeout>;
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        timeoutId = setTimeout(() => {
          onSavePosition(chapterId, currentParagraphIndexRef.current);
        }, 400);
      } else {
        clearTimeout(timeoutId);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      clearTimeout(timeoutId);
    };
  }, [onSavePosition, isPublicationMode, currentChapter?.id]);

  // beforeunload: save position when closing tab (fetch with keepalive)
  useEffect(() => {
    if (!onSavePosition || !isPublicationMode || !publicationId || !currentChapter) return;
    const chapterId = currentChapter.id;
    const handler = () => {
      const token = authService.getToken();
      if (!token) return;
      const idx = currentParagraphIndexRef.current;
      fetch(`/api/publications/${publicationId}/reading-position`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterId, paragraphIndex: idx }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [onSavePosition, isPublicationMode, publicationId, currentChapter?.id]);

  // IntersectionObserver: detect when user has scrolled to 85%+ (last paragraph visible)
  useEffect(() => {
    if (!onChapterRead || !isPublicationMode) return;
    const el = lastParagraphRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || entry.intersectionRatio < 0.85) return;
        scrolledToEndRef.current = true;

        const ch = chapters[currentChapterIndex];
        if (!ch || markedThisSessionRef.current.has(ch.id)) return;

        const isLastChapter = currentChapterIndex >= chapters.length - 1;
        if (isLastChapter) {
          markedThisSessionRef.current.add(ch.id);
          onChapterRead(ch.id);
        }
      },
      { threshold: 0.85, rootMargin: '0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [
    onChapterRead,
    isPublicationMode,
    chapters,
    currentChapterIndex,
    chapterContentMap,
    chapterContentLoading,
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
  }, [readerSettings]);

  // Scroll content area to top when chapter changes (skip if we'll scroll to initial paragraph)
  const shouldSkipScrollToTop =
    initialParagraphIndex !== undefined &&
    initialParagraphIndex > 0 &&
    chapters[currentChapterIndex] &&
    initialChapterId === chapters[currentChapterIndex].id &&
    !hasAppliedInitialScrollRef.current;

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
  useEffect(() => {
    if (
      !isPublicationMode ||
      !onSavePosition ||
      initialParagraphIndex === undefined ||
      initialParagraphIndex <= 0 ||
      !currentChapter ||
      currentChapter.id !== initialChapterId ||
      hasAppliedInitialScrollRef.current
    )
      return;
    const el = contentRef.current;
    if (!el) return;
    const target = el.querySelector(`[data-paragraph-index="${initialParagraphIndex}"]`);
    if (target) {
      hasAppliedInitialScrollRef.current = true;
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }, [
    isPublicationMode,
    initialParagraphIndex,
    initialChapterId,
    currentChapter,
    chapterContentMap,
    onSavePosition,
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

  const handlePrevChapter = useCallback(() => {
    const ch = chapters[currentChapterIndex];
    if (ch && onSavePosition && isPublicationMode) {
      onSavePosition(ch.id, currentParagraphIndexRef.current);
    }
    setCurrentChapterIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, [chapters, currentChapterIndex, onSavePosition, isPublicationMode]);

  const handleNextChapter = useCallback(() => {
    const ch = chapters[currentChapterIndex];
    if (
      ch &&
      onChapterRead &&
      scrolledToEndRef.current &&
      !markedThisSessionRef.current.has(ch.id)
    ) {
      markedThisSessionRef.current.add(ch.id);
      onChapterRead(ch.id);
    }
    if (ch && onSavePosition && isPublicationMode) {
      onSavePosition(ch.id, currentParagraphIndexRef.current);
    }
    setCurrentChapterIndex((prev) => (prev < chapters.length - 1 ? prev + 1 : prev));
  }, [chapters, currentChapterIndex, onChapterRead, onSavePosition, isPublicationMode]);

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
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, handlePrevChapter, handleNextChapter, onExit]);

  const handleReaderSettingsChange = async (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...readerSettings, ...updates };
    setReaderSettings(newSettings);
    const isAuth = authService.isAuthenticated();
    if (isAuth) {
      api.updateUserReaderSettings(newSettings).catch(() => {});
    }
    if (!isPublicationMode && project) {
      await api.updateReaderSettings(project.id, newSettings);
    }
  };

  const handleShare = useCallback(() => {
    const currentChapter = chapters[currentChapterIndex];
    if (!currentChapter) return;

    let url: string;
    if (isPublicationMode && publicationId) {
      url = `${window.location.origin}/p/${publicationId}/chapters/${currentChapter.id}/reading`;
    } else if (project) {
      const params = new URLSearchParams();
      params.set('project', project.id);
      params.set('chapter', currentChapter.id);
      params.set('reading', 'true');
      url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    } else {
      return;
    }
    setShareLink(url);
    setShowShareModal(true);
  }, [isPublicationMode, publicationId, project, chapters, currentChapterIndex]);

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

  const handleSelectChapter = useCallback(
    (index: number) => {
      const ch = chapters[currentChapterIndex];
      if (ch && onSavePosition && isPublicationMode) {
        onSavePosition(ch.id, currentParagraphIndexRef.current);
      }
      setCurrentChapterIndex(index);
      setShowTOC(false);
      window.scrollTo(0, 0);
    },
    [chapters, currentChapterIndex, onSavePosition, isPublicationMode]
  );

  if (chapters.length === 0) {
    return (
      <div
        class="reading-mode"
        data-reader-font={readerSettings.fontFamily}
        data-reader-theme={readerSettings.colorScheme}
      >
        <div class="reading-mode-empty">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>
              {isPublicationMode
                ? t('readingMode.noChaptersForReading')
                : isOriginalReadingMode
                  ? t('readingMode.noChaptersForReading')
                  : t('readingMode.noTranslatedChapters')}
            </h2>
            <p style={{ color: 'var(--reader-text-dim)', marginBottom: '2rem' }}>
              {isPublicationMode
                ? t('readingMode.noTranslatedChapters')
                : isOriginalReadingMode
                  ? t('readingMode.noOriginalChaptersForReading')
                  : t('readingMode.needTranslateOneChapter')}
            </p>
            <button
              class="reading-mode-exit-btn"
              onClick={onExit}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--reader-accent)',
                color: 'var(--reader-accent-text)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
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
      data-header-visible={headerVisible ? 'true' : 'false'}
      data-footer-visible={footerVisible ? 'true' : 'false'}
    >
      {/* Header: back, chapter title (no work title), actions */}
      <div ref={headerRef} class="reading-mode-header">
        <div class="reading-mode-header-left">
          <button class="reading-mode-exit-btn" onClick={onExit} title={t('readingMode.exitTitle')}>
            ← {t('common.back')}
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
              📝
            </button>
          )}
          <button
            class="reading-mode-header-btn"
            onClick={() => setShowTOC(true)}
            title={t('readingMode.toc')}
          >
            📑
          </button>
          <button
            class="reading-mode-header-btn"
            onClick={handleShare}
            title={t('readingMode.shareLink')}
          >
            🔗
          </button>
          <button
            class="reading-mode-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title={t('readingMode.settingsTitle')}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings Panel with overlay - click outside to close */}
      {showSettings && (
        <div
          class="reading-mode-settings-overlay"
          onClick={() => setShowSettings(false)}
          role="presentation"
        >
          <div class="reading-mode-settings-panel" onClick={(e) => e.stopPropagation()}>
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
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
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
            <p style={{ color: 'var(--reader-text-dim)', textAlign: 'center' }}>
              {isPublicationMode
                ? t('readingMode.noTranslatedText')
                : isOriginalReadingMode
                  ? t('readingMode.noOriginalText')
                  : t('readingMode.noTranslatedText')}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Navigation - prev/next in row, centered */}
      <div ref={footerRef} class="reading-mode-footer">
        <button
          class="reading-mode-footer-btn"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          title={t('chapter.prevChapter')}
        >
          ‹
        </button>
        <button
          class="reading-mode-footer-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
          title={t('chapter.nextChapter')}
        >
          ›
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
        readChapterIds={readChapterIds}
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
        title={`🔗 ${t('readingMode.shareLink')}`}
        footer={
          <button
            class="reading-share-copy-btn"
            onClick={handleCopyShareLink}
            style={{
              padding: '0.75rem 1.5rem',
              background: shareCopied ? 'var(--success)' : 'var(--reader-accent)',
              color: 'var(--reader-accent-text)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 600,
              width: '100%',
            }}
          >
            {shareCopied ? `✓ ${t('readingMode.copied')}!` : `📋 ${t('readingMode.copyLink')}`}
          </button>
        }
      >
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: 'var(--reader-text-dim)', marginBottom: '0.5rem' }}>
            {t('readingMode.linkLabel')}
          </p>
          <input
            type="text"
            value={shareLink}
            readOnly
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--reader-chrome-bg)',
              border: '1px solid var(--reader-chrome-border)',
              borderRadius: '8px',
              color: 'var(--reader-text)',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-mono)',
            }}
          />
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
    </div>
  );
}
