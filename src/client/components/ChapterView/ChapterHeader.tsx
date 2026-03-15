import { useState, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter, ChapterListItem } from '../../types';
import { Button, StatusBadge, Icon, Skeleton } from '../ui';
import { api } from '../../api/client';
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
  onApproveAll: () => void;
  onToggleSettings: () => void;
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
  onApproveAll,
  onToggleSettings,
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
    }
  }, [isEditingTitle]);

  const hasTranslations = chapter?.paragraphs?.some((p) => p.translatedText);
  const hasTranslatedText = !!chapter?.translatedText;
  const isCompleted = chapter?.status === 'completed';

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
    <div class={`chapter-header ${isEditingTitle ? 'is-editing-title' : ''}`}>
      <div class="chapter-nav">
        <button
          class="chapter-nav-btn"
          disabled={!canPrev}
          onClick={onPrev}
          title={t('chapter.prevChapter')}
        >
          <Icon name="chevron_left" />
        </button>
        {chapter && isEditingTitle ? (
          <div class="chapter-title-edit">
            <input
              ref={titleInputRef}
              type="text"
              class="chapter-title-input"
              value={editedTitle}
              onInput={(e) => setEditedTitle((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveTitle}
              disabled={savingTitle}
            />
            <div class="chapter-title-edit-actions">
              <button
                class="chapter-title-save-btn"
                onClick={handleSaveTitle}
                disabled={savingTitle}
                title={t('chapter.saveEnter')}
              >
                <Icon name="check" size="sm" />
              </button>
              <button
                class="chapter-title-cancel-btn"
                onClick={handleCancelEdit}
                disabled={savingTitle}
                title={t('chapter.cancelEsc')}
              >
                <Icon name="close" size="sm" />
              </button>
            </div>
          </div>
        ) : (
          <div class="chapter-title-wrapper">
            <h2 class="chapter-title">{title}</h2>
            {chapter && (
              <button
                class="chapter-title-edit-btn"
                onClick={handleStartEdit}
                title={t('chapter.editTitle')}
              >
                <Icon name="edit" size="sm" />
              </button>
            )}
          </div>
        )}
        <button
          class="chapter-nav-btn"
          disabled={!canNext}
          onClick={onNext}
          title={t('chapter.nextChapter')}
        >
          <Icon name="chevron_right" />
        </button>

        {/* Settings button - в навигации, а не в actions */}
        <button
          class="chapter-nav-btn chapter-settings-btn"
          onClick={onToggleSettings}
          title={t('reader.displaySettings')}
        >
          <Icon name="settings" />
        </button>
      </div>

      <div class="chapter-actions">
        {showSkeletonActions ? (
          <>
            <Skeleton variant="block" width={72} height={32} />
            <Skeleton variant="block" width={100} height={32} />
            <Skeleton variant="block" width={90} height={32} />
          </>
        ) : (
          <>
            {!isOriginalReadingMode && chapter && (
              <StatusBadge status={chapter.status} showText={chapter.status !== 'completed'} />
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

            {hasTranslations && !isCompleted && (
              <Button variant="secondary" size="sm" onClick={onApproveAll}>
                <Icon name="done_all" size="sm" /> {t('chapter.approveAll')}
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
          </>
        )}
      </div>
    </div>
  );
}
