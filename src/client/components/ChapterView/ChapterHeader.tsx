import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter, ChapterListItem } from '../../types';
import { Button, Modal, Icon, Skeleton } from '../ui';
import { api } from '../../api/client';
import '../ui/Input.css';
import { ChapterStatusSelect } from './ChapterStatusSelect';
import './ChapterHeader.css';

interface ChapterHeaderProps {
  chapter: Chapter | null;
  /** Used when chapter is null (loading) for title and nav */
  chapterListItem?: ChapterListItem;
  projectId: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleTranslationPanel: () => void;
  isTranslationPanelOpen?: boolean;
  onToggleSettings: () => void;
  onToggleSearch?: () => void;
  isSearchOpen?: boolean;
  onEnterReadingMode?: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  isOriginalReadingMode?: boolean;
  /** When true, show skeleton for actions (chapter loading) */
  isLoading?: boolean;
}

export function ChapterHeader({
  chapter,
  chapterListItem,
  projectId,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onToggleTranslationPanel,
  isTranslationPanelOpen = false,
  onToggleSettings,
  onToggleSearch,
  isSearchOpen = false,
  onEnterReadingMode,
  onChapterUpdate,
  isOriginalReadingMode = false,
  isLoading = false,
}: ChapterHeaderProps) {
  const { t } = useTranslation();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const displayChapter = chapter ?? chapterListItem;
  const title = displayChapter?.title ?? '';
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    setEditedTitle(displayChapter?.title ?? '');
  }, [displayChapter?.title]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const hasTranslations = chapter?.paragraphs?.some((p) => p.translatedText);
  const hasTranslatedText = !!chapter?.translatedText;

  const hasOriginalText = !!(chapter?.originalText && chapter.originalText.trim().length > 0);
  const hasOriginalParagraphs = chapter?.paragraphs?.some(
    (p) => p.originalText && p.originalText.trim().length > 0
  );
  const canRead = isOriginalReadingMode
    ? hasOriginalText || hasOriginalParagraphs
    : hasTranslations || hasTranslatedText;

  const handleStartEdit = () => {
    if (!chapter) return;
    setIsEditingTitle(true);
    setEditedTitle(chapter.title);
  };

  const handleSaveTitle = async () => {
    if (!chapter || !editedTitle.trim() || editedTitle.trim() === chapter.title) {
      setIsEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    try {
      const updated = await api.updateChapterTitle(projectId, chapter.id, editedTitle.trim());
      onChapterUpdate(updated);
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to update chapter title:', error);
      setEditedTitle(chapter.title);
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle(chapter?.title ?? title);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const showSkeletonActions = isLoading || !chapter;

  return (
    <div class="chapter-header">
      <div class="chapter-header-left">
        <div class="chapter-nav">
          <button
            class="chapter-nav-btn"
            disabled={!canPrev}
            onClick={onPrev}
            title={t('chapter.prevChapter')}
          >
            <Icon name="chevron_left" />
          </button>
          <div class="chapter-title-wrapper">
            <h2
              class={`chapter-title ${chapter ? 'chapter-title-editable' : ''}`}
              onClick={chapter ? handleStartEdit : undefined}
              onKeyDown={
                chapter
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleStartEdit();
                      }
                    }
                  : undefined
              }
              role={chapter ? 'button' : undefined}
              tabIndex={chapter ? 0 : undefined}
              title={chapter ? t('chapter.editTitle') : undefined}
            >
              {title}
            </h2>
          </div>
          <button
            class="chapter-nav-btn"
            disabled={!canNext}
            onClick={onNext}
            title={t('chapter.nextChapter')}
          >
            <Icon name="chevron_right" />
          </button>
        </div>
      </div>

      <div class="chapter-header-right">
        {showSkeletonActions ? (
          <>
            <Skeleton variant="block" width={72} height={32} />
            <Skeleton variant="block" width={100} height={32} />
            <Skeleton variant="block" width={90} height={32} />
          </>
        ) : (
          <>
            {!isOriginalReadingMode && chapter && (
              <ChapterStatusSelect
                chapter={chapter}
                projectId={projectId}
                onChapterUpdate={onChapterUpdate}
              />
            )}

            {canRead && onEnterReadingMode && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onEnterReadingMode}
                title={t('chapter.readingMode')}
              >
                <Icon name="menu_book" size="sm" /> {t('chapter.read')}
              </Button>
            )}

            {!isOriginalReadingMode && (
              <Button
                variant={isTranslationPanelOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={onToggleTranslationPanel}
                title={t('translationPanel.toggle', 'Панель перевода')}
              >
                <Icon name="translate" size="sm" /> {t('chapter.translate', 'Перевод')}
              </Button>
            )}

            {onToggleSearch && (
              <button
                class={`chapter-header-btn ${isSearchOpen ? 'is-active' : ''}`}
                onClick={onToggleSearch}
                title={t('searchReplace.findInChapter', 'Find in chapter')}
                aria-label={t('searchReplace.findInChapter', 'Find in chapter')}
              >
                <Icon name="search" />
              </button>
            )}

            <button
              class="chapter-header-btn"
              onClick={onToggleSettings}
              title={t('reader.displaySettings')}
            >
              <Icon name="settings" />
            </button>
          </>
        )}
      </div>

      <Modal
        isOpen={isEditingTitle}
        onClose={handleCancelEdit}
        title={t('chapter.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={handleCancelEdit} disabled={savingTitle}>
              {t('chapter.cancelEsc')}
            </Button>
            <Button variant="primary" onClick={handleSaveTitle} disabled={savingTitle}>
              {t('chapter.saveEnter')}
            </Button>
          </>
        }
      >
        <div class="form-group">
          <input
            ref={titleInputRef}
            type="text"
            class="form-input"
            value={editedTitle}
            onInput={(e) => setEditedTitle((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            disabled={savingTitle}
          />
        </div>
      </Modal>
    </div>
  );
}
