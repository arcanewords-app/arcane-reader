import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Chapter } from '../../types';
import { Button, StatusBadge } from '../ui';
import { api } from '../../api/client';
import './ChapterHeader.css';

interface ChapterHeaderProps {
  chapter: Chapter;
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
  translating: boolean;
  isOriginalReadingMode?: boolean;
  /** Mark chapter as translated (shown in originalReadingMode when panel is hidden) */
  onMarkAsTranslated?: () => void;
  markingAsTranslated?: boolean;
}

export function ChapterHeader({
  chapter,
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
  translating,
  isOriginalReadingMode = false,
  onMarkAsTranslated,
  markingAsTranslated = false,
}: ChapterHeaderProps) {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(chapter.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const hasTranslations = chapter.paragraphs?.some((p) => p.translatedText);
  const hasTranslatedText = !!chapter.translatedText;
  const isCompleted = chapter.status === 'completed';

  const hasOriginalText = !!(chapter.originalText && chapter.originalText.trim().length > 0);
  const hasOriginalParagraphs = chapter.paragraphs?.some((p) => p.originalText && p.originalText.trim().length > 0);
  const canRead = isOriginalReadingMode
    ? (hasOriginalText || hasOriginalParagraphs)
    : (hasTranslations || hasTranslatedText);

  const handleStartEdit = () => {
    setIsEditingTitle(true);
    setEditedTitle(chapter.title);
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || editedTitle.trim() === chapter.title) {
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
    setEditedTitle(chapter.title);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div class={`chapter-header ${isEditingTitle ? 'is-editing-title' : ''}`}>
      <div class="chapter-nav">
        <button
          class="chapter-nav-btn"
          disabled={!canPrev}
          onClick={onPrev}
          title={t('chapter.prevChapter')}
        >
          ◀
        </button>
        {isEditingTitle ? (
          <div class="chapter-title-edit">
            <input
              type="text"
              class="chapter-title-input"
              value={editedTitle}
              onInput={(e) => setEditedTitle((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveTitle}
              disabled={savingTitle}
              autoFocus
            />
            <div class="chapter-title-edit-actions">
              <button
                class="chapter-title-save-btn"
                onClick={handleSaveTitle}
                disabled={savingTitle}
                title={t('chapter.saveEnter')}
              >
                ✓
              </button>
              <button
                class="chapter-title-cancel-btn"
                onClick={handleCancelEdit}
                disabled={savingTitle}
                title={t('chapter.cancelEsc')}
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div class="chapter-title-wrapper">
            <h2 class="chapter-title">{chapter.title}</h2>
            <button
              class="chapter-title-edit-btn"
              onClick={handleStartEdit}
              title={t('chapter.editTitle')}
            >
              ✏️
            </button>
          </div>
        )}
        <button
          class="chapter-nav-btn"
          disabled={!canNext}
          onClick={onNext}
          title={t('chapter.nextChapter')}
        >
          ▶
        </button>
        
        {/* Settings button - в навигации, а не в actions */}
        <button
          class="chapter-nav-btn chapter-settings-btn"
          onClick={onToggleSettings}
          title={t('reader.displaySettings')}
        >
          ⚙️
        </button>
      </div>

      <div class="chapter-actions">
        {!isOriginalReadingMode && (
          <StatusBadge status={chapter.status} showText={chapter.status !== 'completed'} />
        )}

        {canRead && onEnterReadingMode && (
          <Button variant="secondary" size="sm" onClick={onEnterReadingMode} title={t('chapter.readingMode')}>
            📖 {t('chapter.read')}
          </Button>
        )}

        {hasTranslations && !isCompleted && (
          <Button variant="secondary" size="sm" onClick={onApproveAll}>
            ✅ {t('chapter.approveAll')}
          </Button>
        )}

        {!isOriginalReadingMode && (
          <Button
            variant={isTranslationPanelOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={onToggleTranslationPanel}
            title={t('translationPanel.toggle', 'Панель перевода')}
          >
            🔮 {t('chapter.translate', 'Перевод')}
          </Button>
        )}

        {isOriginalReadingMode && onMarkAsTranslated && chapter.paragraphs && chapter.paragraphs.length > 0 && (chapter.status === 'pending' || chapter.status === 'error') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onMarkAsTranslated}
            disabled={translating || markingAsTranslated}
            title={t('markAsTranslated.title', 'Пометить как переведённую')}
          >
            {markingAsTranslated ? <span class="spinner" /> : '✅'} {t('markAsTranslated.button', 'Пометить как переведённую')}
          </Button>
        )}
      </div>
    </div>
  );
}
