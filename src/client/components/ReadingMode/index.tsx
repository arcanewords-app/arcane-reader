import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Project, Chapter, ReaderSettings } from '../../types';
import { api } from '../../api/client';
import { ReaderSettingsPanel } from '../ChapterView/ReaderSettings';
import { Modal } from '../ui';
import './ReadingMode.css';

/** Chapter shape for reader: full Chapter (project) or minimal + loaded content (publication) */
type ReaderChapter = (Chapter & { translatedText?: string }) | { id: string; number: number; title: string; translatedText?: string };

interface ReadingModeProps {
  project?: Project;
  /** Publication mode: show translated text from catalog */
  publicationId?: string;
  publicationTitle?: string;
  publicationChapters?: Array<{ id: string; number: number; title: string }>;
  initialChapterId?: string;
  onExit: () => void;
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
  initialChapterId,
  onExit,
}: ReadingModeProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project?.settings?.reader || defaultReaderSettings
  );
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [chapterContentMap, setChapterContentMap] = useState<Record<string, string>>({});
  const [chapterContentLoading, setChapterContentLoading] = useState(false);

  const isPublicationMode = !!publicationId;

  // Determine reading mode (project mode only)
  const isOriginalReadingMode = !isPublicationMode && (project?.settings?.originalReadingMode ?? false);

  // Publication mode: set chapters from catalog and initial index (own effect so project mode doesn't depend on publicationChapters reference)
  useEffect(() => {
    if (!isPublicationMode) return;
    const list: ReaderChapter[] = publicationChapters.map((ch) => ({ ...ch }));
    setChapters(list);
    if (list.length > 0) {
      const idx = initialChapterId
        ? list.findIndex((ch) => ch.id === initialChapterId)
        : 0;
      setCurrentChapterIndex(idx >= 0 ? idx : 0);
    }
  }, [isPublicationMode, publicationChapters, initialChapterId]);

  // Project mode: filter and load chapters from project (separate effect so it only runs when project/initialChapterId change, not on every render)
  useEffect(() => {
    if (isPublicationMode || !project) return;

    let availableChapters: Chapter[];
    if (isOriginalReadingMode) {
      availableChapters = project.chapters
        .filter((ch) => ch.originalText)
        .sort((a, b) => a.number - b.number);
    } else {
      availableChapters = project.chapters
        .filter(
          (ch) =>
            ch.status === 'completed' &&
            (ch.translatedText ||
              (ch.paragraphs && ch.paragraphs.some((p) => p.translatedText)))
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

  // Apply reader settings as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-font-size', `${readerSettings.fontSize}px`);
    root.style.setProperty('--reader-line-height', `${readerSettings.lineHeight}`);
    root.setAttribute('data-reader-font', readerSettings.fontFamily);
    root.setAttribute('data-reader-theme', readerSettings.colorScheme);
  }, [readerSettings]);

  const handlePrevChapter = useCallback(() => {
    setCurrentChapterIndex((prev) => {
      if (prev > 0) {
        window.scrollTo(0, 0);
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const handleNextChapter = useCallback(() => {
    setCurrentChapterIndex((prev) => {
      if (prev < chapters.length - 1) {
        window.scrollTo(0, 0);
        return prev + 1;
      }
      return prev;
    });
  }, [chapters.length]);

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
      <div class="reading-mode">
        <div class="reading-mode-empty">
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>
              {isPublicationMode
                ? t('readingMode.noChaptersForReading')
                : isOriginalReadingMode
                ? t('readingMode.noChaptersForReading')
                : t('readingMode.noTranslatedChapters')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
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
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              {isPublicationMode ? t('readingMode.backToPublication') : t('readingMode.backToProject')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get text: publication mode from chapterContentMap, project mode from chapter
  const getText = (chapter: ReaderChapter): string => {
    if (isPublicationMode) {
      return chapterContentMap[chapter.id] ?? '';
    }
    const ch = chapter as Chapter;
    if (isOriginalReadingMode) {
      return ch.originalText || '';
    }
    if (ch.paragraphs && ch.paragraphs.length > 0) {
      const paragraphs = ch.paragraphs
        .sort((a, b) => a.index - b.index)
        .filter((p) => p.translatedText)
        .map((p) => p.translatedText!);
      return paragraphs.join('\n\n');
    }
    return ch.translatedText || '';
  };

  const displayText = currentChapter ? getText(currentChapter) : '';

  return (
    <div class="reading-mode">
      {/* Header */}
      <div class="reading-mode-header">
        <div class="reading-mode-header-left">
          <button
            class="reading-mode-exit-btn"
            onClick={onExit}
            title={t('readingMode.exitTitle')}
          >
            ← {t('common.back')}
          </button>
          <div class="reading-mode-title">
            <h2>{isPublicationMode ? publicationTitle : project?.name}</h2>
            <span class="reading-mode-chapter-info">
              {t('readingMode.chapterOf', { current: currentChapterIndex + 1, total: chapters.length })}
            </span>
          </div>
        </div>
        <div class="reading-mode-header-right">
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

      {/* Settings Panel */}
      {showSettings && (
        <div class="reading-mode-settings-panel">
          <ReaderSettingsPanel
            settings={readerSettings}
            onChange={handleReaderSettingsChange}
          />
        </div>
      )}

      {/* Navigation */}
      <div class="reading-mode-nav">
        <button
          class="reading-mode-nav-btn"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
          title={`${t('chapter.prevChapter')} (←)`}
        >
          ← {t('readingMode.prev')}
        </button>
        <div class="reading-mode-nav-info">
          {currentChapter?.title || t('readingMode.chapterFallback', { n: currentChapterIndex + 1 })}
        </div>
        <button
          class="reading-mode-nav-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
          title={`${t('chapter.nextChapter')} (→)`}
        >
          {t('readingMode.next')} →
        </button>
      </div>

      {/* Content */}
      <div class="reading-mode-content">
        <div class="reading-mode-text">
          {chapterContentLoading ? (
            <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>{t('common.loading')}</p>
          ) : displayText ? (
            displayText.split('\n\n').map((paragraph, idx) => (
              <p key={idx} class="reading-mode-paragraph">
                {paragraph}
              </p>
            ))
          ) : (
            <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>
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
          class="reading-mode-nav-btn"
          onClick={handlePrevChapter}
          disabled={currentChapterIndex === 0}
        >
          ← {t('readingMode.prev')}
        </button>
        <div class="reading-mode-progress">
          {currentChapterIndex + 1} / {chapters.length}
        </div>
        <button
          class="reading-mode-nav-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
        >
          {t('readingMode.next')} →
        </button>
      </div>

      {/* Table of Contents Modal - dedicated TOC styling (not glossary modal) */}
      <Modal
        isOpen={showTOC}
        onClose={() => setShowTOC(false)}
        title={`📑 ${t('readingMode.toc')}`}
        size="large"
        className="toc-modal"
      >
        <div class="reading-toc-list">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              class={`reading-toc-item ${index === currentChapterIndex ? 'active' : ''}`}
              onClick={() => handleSelectChapter(index)}
            >
              <span class="reading-toc-number">{index + 1}</span>
              <span class="reading-toc-title">{chapter.title}</span>
              {index === currentChapterIndex && (
                <span class="reading-toc-current">{t('readingMode.current')}</span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
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
              background: shareCopied ? 'var(--success)' : 'var(--accent)',
              color: 'white',
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
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {t('readingMode.linkLabel')}
          </p>
          <input
            type="text"
            value={shareLink}
            readOnly
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
