import { useState, useEffect, useCallback } from 'preact/hooks';
import type { Project, Chapter, ReaderSettings } from '../../types';
import { api } from '../../api/client';
import { ReaderSettingsPanel } from '../ChapterView/ReaderSettings';
import { Modal } from '../ui';
import './ReadingMode.css';

interface ReadingModeProps {
  project: Project;
  initialChapterId?: string;
  onExit: () => void;
}

const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.7,
  fontFamily: 'literary',
  colorScheme: 'dark',
};

export function ReadingMode({ project, initialChapterId, onExit }: ReadingModeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    project.settings.reader || defaultReaderSettings
  );
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  // Filter and load only completed chapters
  useEffect(() => {
    const completedChapters = project.chapters
      .filter(ch => ch.status === 'completed' && ch.translatedText)
      .sort((a, b) => a.number - b.number);
    
    setChapters(completedChapters);
    
    // Set initial chapter index
    if (completedChapters.length > 0) {
      if (initialChapterId) {
        // Find chapter by ID
        const chapterIndex = completedChapters.findIndex(ch => ch.id === initialChapterId);
        if (chapterIndex >= 0) {
          setCurrentChapterIndex(chapterIndex);
        } else {
          setCurrentChapterIndex(0);
        }
      } else {
        setCurrentChapterIndex(0);
      }
    }
  }, [project, initialChapterId]);

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
    await api.updateReaderSettings(project.id, newSettings);
  };

  const handleShare = useCallback(() => {
    const currentChapter = chapters[currentChapterIndex];
    if (!currentChapter) return;

    const params = new URLSearchParams();
    params.set('project', project.id);
    params.set('chapter', currentChapter.id);
    params.set('reading', 'true');

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    setShareLink(url);
    setShowShareModal(true);
  }, [project.id, chapters, currentChapterIndex]);

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
            <h2 style={{ marginBottom: '1rem' }}>Нет переведенных глав</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Для использования режима чтения нужно перевести хотя бы одну главу.
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
              Вернуться к проекту
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get translated text from paragraphs or fallback to chapter.translatedText
  const getTranslatedText = (chapter: Chapter): string => {
    if (chapter.paragraphs && chapter.paragraphs.length > 0) {
      const paragraphs = chapter.paragraphs
        .sort((a, b) => a.index - b.index)
        .filter(p => p.translatedText)
        .map(p => p.translatedText);
      return paragraphs.join('\n\n');
    }
    return chapter.translatedText || '';
  };

  const translatedText = currentChapter ? getTranslatedText(currentChapter) : '';

  return (
    <div class="reading-mode">
      {/* Header */}
      <div class="reading-mode-header">
        <div class="reading-mode-header-left">
          <button
            class="reading-mode-exit-btn"
            onClick={onExit}
            title="Выйти из режима чтения (Esc)"
          >
            ← Назад
          </button>
          <div class="reading-mode-title">
            <h2>{project.name}</h2>
            <span class="reading-mode-chapter-info">
              Глава {currentChapterIndex + 1} из {chapters.length}
            </span>
          </div>
        </div>
        <div class="reading-mode-header-right">
          <button
            class="reading-mode-header-btn"
            onClick={() => setShowTOC(true)}
            title="Оглавление"
          >
            📑
          </button>
          <button
            class="reading-mode-header-btn"
            onClick={handleShare}
            title="Поделиться"
          >
            🔗
          </button>
          <button
            class="reading-mode-settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Настройки чтения"
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
          title="Предыдущая глава (←)"
        >
          ← Предыдущая
        </button>
        <div class="reading-mode-nav-info">
          {currentChapter?.title || `Глава ${currentChapterIndex + 1}`}
        </div>
        <button
          class="reading-mode-nav-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
          title="Следующая глава (→)"
        >
          Следующая →
        </button>
      </div>

      {/* Content */}
      <div class="reading-mode-content">
        <div class="reading-mode-text">
          {translatedText ? (
            translatedText.split('\n\n').map((paragraph, idx) => (
              <p key={idx} class="reading-mode-paragraph">
                {paragraph}
              </p>
            ))
          ) : (
            <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>
              Нет переведенного текста
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
          ← Предыдущая
        </button>
        <div class="reading-mode-progress">
          {currentChapterIndex + 1} / {chapters.length}
        </div>
        <button
          class="reading-mode-nav-btn"
          onClick={handleNextChapter}
          disabled={currentChapterIndex >= chapters.length - 1}
        >
          Следующая →
        </button>
      </div>

      {/* Table of Contents Modal */}
      <Modal
        isOpen={showTOC}
        onClose={() => setShowTOC(false)}
        title="📑 Оглавление"
        size="large"
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
                <span class="reading-toc-current">Текущая</span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* Share Modal */}
      <Modal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareCopied(false);
        }}
        title="🔗 Поделиться ссылкой"
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
            {shareCopied ? '✓ Скопировано!' : '📋 Копировать ссылку'}
          </button>
        }
      >
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Ссылка на текущую главу:
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
