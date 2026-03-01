import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type {
  Project,
  ProjectWithChapterList,
  Chapter,
  ChapterListItem,
  ReaderSettings,
  GlossaryEntry,
} from '../../types';
import { api } from '../../api/client';
import { authService } from '../../services/authService';
import { ReaderSettingsPanel } from '../ChapterView/ReaderSettings';
import { PublicationGlossaryModal } from '../Glossary';
import { ChapterTocModal } from '../ChapterTocModal';
import { Modal } from '../ui';
import { renderTextWithBlocks } from '../../utils/text-blocks';
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
  /** Set of chapter IDs marked as read (for TOC indicator). */
  readChapterIds?: Set<string>;
}

const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.7,
  fontFamily: 'literary',
  colorScheme: 'dark',
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
  readChapterIds,
}: ReadingModeProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project?.settings?.reader || defaultReaderSettings
  );
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [chapterContentMap, setChapterContentMap] = useState<Record<string, string>>(
    () => initialChapterContent ?? {}
  );
  const [chapterContentLoading, setChapterContentLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(true);

  const isPublicationMode = !!publicationId;
  const lastScrollTopRef = useRef(0);
  const scrollAccumRef = useRef(0);
  const scrollThreshold = 50;

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
  useEffect(() => {
    if (!isPublicationMode || !publicationId || chapters.length === 0) return;
    const ch = chapters[currentChapterIndex];
    if (!ch || chapterContentMap[ch.id]) return;

    setChapterContentLoading(true);
    api
      .getPublicationChapter(publicationId, ch.id)
      .then((data) => {
        setChapterContentMap((prev) => ({ ...prev, [data.id]: data.translatedText }));
      })
      .catch(() => {})
      .finally(() => setChapterContentLoading(false));
  }, [isPublicationMode, publicationId, chapters, currentChapterIndex, chapterContentMap]);

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
          : fullChapter.paragraphs && fullChapter.paragraphs.length > 0
            ? fullChapter.paragraphs
                .sort((a, b) => a.index - b.index)
                .filter((p) => p.translatedText)
                .map((p) => p.translatedText!)
                .join('\n\n')
            : fullChapter.translatedText || '';
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

  // Reset "scrolled to end" flag when chapter changes
  useEffect(() => {
    scrolledToEndRef.current = false;
  }, [currentChapterIndex]);

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
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
  }, [readerSettings]);

  // Scroll content area to top when chapter changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
      lastScrollTopRef.current = 0;
      scrollAccumRef.current = 0;
      setMenuVisible(true);
    }
  }, [currentChapterIndex]);

  // Mobile: hide menu on scroll down, show on scroll up
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const mq = window.matchMedia('(max-width: 768px)');
    let rafId: number;

    const handleScroll = () => {
      if (!mq.matches) return;
      rafId = requestAnimationFrame(() => {
        const scrollTop = el.scrollTop;
        const delta = scrollTop - lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        if (delta > 0) {
          scrollAccumRef.current += delta;
          if (scrollAccumRef.current > scrollThreshold) {
            setMenuVisible(false);
            setShowSettings(false);
            scrollAccumRef.current = 0;
          }
        } else if (delta < 0) {
          scrollAccumRef.current = 0;
          setMenuVisible(true);
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [currentChapterIndex]);

  const handlePrevChapter = useCallback(() => {
    setCurrentChapterIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

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

    setCurrentChapterIndex((prev) => (prev < chapters.length - 1 ? prev + 1 : prev));
  }, [chapters, currentChapterIndex, onChapterRead]);

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

  const handleSelectChapter = useCallback((index: number) => {
    setCurrentChapterIndex(index);
    setShowTOC(false);
    window.scrollTo(0, 0);
  }, []);

  const currentChapter = chapters[currentChapterIndex];

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

  return (
    <div
      class={`reading-mode${!menuVisible ? ' reading-mode-chrome-hidden' : ''}`}
      data-reader-font={readerSettings.fontFamily}
      data-reader-theme={readerSettings.colorScheme}
    >
      {/* Header: back, chapter title (no work title), actions */}
      <div class="reading-mode-header">
        <div class="reading-mode-header-left">
          <button class="reading-mode-exit-btn" onClick={onExit} title={t('readingMode.exitTitle')}>
            ← {t('common.back')}
          </button>
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

      {/* Navigation */}
      <div class="reading-mode-nav">
        <button
          class="reading-mode-nav-btn reading-mode-nav-btn-icon"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          title={t('chapter.prevChapter')}
        >
          ‹
        </button>
        <div class="reading-mode-nav-info">
          {currentChapter?.title ||
            t('readingMode.chapterFallback', { n: currentChapterIndex + 1 })}
        </div>
        <button
          class="reading-mode-nav-btn reading-mode-nav-btn-icon"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
          title={t('chapter.nextChapter')}
        >
          ›
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} class="reading-mode-content">
        <div class="reading-mode-text">
          {chapterContentLoading ? (
            <p style={{ color: 'var(--reader-text-dim)', textAlign: 'center' }}>
              {t('common.loading')}
            </p>
          ) : displayText ? (
            (() => {
              const textBlockTypes =
                (project?.settings?.textBlockTypes?.length ?? 0) > 0
                  ? (project?.settings?.textBlockTypes ?? [])
                  : DEFAULT_TEXT_BLOCK_TYPES;
              const paragraphs = displayText.split('\n\n');
              return paragraphs.map((paragraph, idx) => (
                <div
                  key={idx}
                  ref={idx === paragraphs.length - 1 ? lastParagraphRef : undefined}
                  class="reading-mode-paragraph"
                  dangerouslySetInnerHTML={{
                    __html: renderTextWithBlocks(paragraph, textBlockTypes),
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

      {/* Bottom Navigation */}
      <div class="reading-mode-footer">
        <button
          class="reading-mode-nav-btn reading-mode-nav-btn-icon"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          title={t('chapter.prevChapter')}
        >
          ‹
        </button>
        <div class="reading-mode-progress">
          {currentChapterIndex + 1} / {chapters.length}
        </div>
        <button
          class="reading-mode-nav-btn reading-mode-nav-btn-icon"
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
