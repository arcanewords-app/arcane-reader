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
  onTranslate: () => void;
  onTranslateEmpty?: () => void;
  onTranslateSelected?: () => void;
  onSelectAllEmpty?: () => void;
  onDeselectAll?: () => void;
  selectedParagraphIds?: string[];
  emptyParagraphIds?: string[];
  estimatedTokensSelected?: number;
  onApproveAll: () => void;
  onToggleSettings: () => void;
  onEnterReadingMode?: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  translating: boolean;
  isOriginalReadingMode?: boolean;
  estimatedTokens?: number;
}

export function ChapterHeader({
  chapter,
  projectId,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onTranslate,
  onTranslateEmpty,
  onTranslateSelected,
  onSelectAllEmpty,
  onDeselectAll,
  selectedParagraphIds = [],
  emptyParagraphIds = [],
  estimatedTokensSelected = 0,
  onApproveAll,
  onToggleSettings,
  onEnterReadingMode,
  onChapterUpdate,
  translating,
  isOriginalReadingMode = false,
  estimatedTokens,
}: ChapterHeaderProps) {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(chapter.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const hasTranslations = chapter.paragraphs?.some((p) => p.translatedText);
  const hasTranslatedText = !!chapter.translatedText;
  const isCompleted = chapter.status === 'completed';
  
  // In original reading mode, check for original text
  // Otherwise, check for translated text
  const hasOriginalText = !!(chapter.originalText && chapter.originalText.trim().length > 0);
  const hasOriginalParagraphs = chapter.paragraphs?.some((p) => p.originalText && p.originalText.trim().length > 0);
  const canRead = isOriginalReadingMode 
    ? (hasOriginalText || hasOriginalParagraphs)
    : (hasTranslations || hasTranslatedText);
  
  // Check for empty paragraphs (need translation)
  const emptyParagraphs = chapter.paragraphs?.filter((p) => {
    const hasText = p.translatedText && p.translatedText.trim().length > 0;
    const isError = p.translatedText?.trim().startsWith('❌') || 
                    p.translatedText?.trim().startsWith('[ERROR');
    return !hasText || isError;
  }) || [];
  
  const hasEmptyParagraphs = emptyParagraphs.length > 0;

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
      setEditedTitle(chapter.title); // Reset on error
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

  const handleCancelTranslation = async () => {
    try {
      await api.cancelTranslation(projectId, chapter.id);
      const updated = await api.getChapter(projectId, chapter.id);
      onChapterUpdate(updated);
    } catch (error) {
      console.error('Failed to cancel translation:', error);
    }
  };

  return (
    <div class="chapter-header">
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
      </div>

      <div class="chapter-actions">
        {!isOriginalReadingMode && (
          <StatusBadge status={chapter.status} />
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
        
        {/* Translate empty / selected paragraphs - show whenever there are empty paragraphs (with or without existing translations) */}
        {!isOriginalReadingMode && hasEmptyParagraphs && chapter.status !== 'translating' && onTranslateEmpty && (
          <>
            {onTranslateSelected && onSelectAllEmpty && onDeselectAll && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginRight: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onSelectAllEmpty}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    padding: '0.2rem 0',
                    textDecoration: 'underline',
                  }}
                >
                  {t('chapter.selectAll')}
                </button>
                <span style={{ color: 'var(--text-dim)' }}>|</span>
                <button
                  type="button"
                  onClick={onDeselectAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '0.2rem 0',
                    textDecoration: 'underline',
                  }}
                >
                  {t('chapter.deselectAll')}
                </button>
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onTranslateEmpty}
              disabled={translating}
              title={t('chapter.translateEmptyTitle', { count: emptyParagraphs.length })}
            >
              🔮 {t('chapter.translateAllEmpty', { count: emptyParagraphs.length })}
            </Button>
            {onTranslateSelected && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onTranslateSelected}
                disabled={translating || selectedParagraphIds.length === 0}
                title={
                  selectedParagraphIds.length === 0
                    ? t('chapter.selectParagraphsBelow')
                    : t('chapter.translateSelectedTitle', { tokens: estimatedTokensSelected.toLocaleString() })
                }
              >
                🔮 {t('chapter.translateSelected', { count: selectedParagraphIds.length })}
                {estimatedTokensSelected > 0 && (
                  <span style={{ marginLeft: '0.25rem', opacity: 0.9 }}>
                    {t('chapter.translateSelectedTokens', { tokens: estimatedTokensSelected.toLocaleString() })}
                  </span>
                )}
              </Button>
            )}
          </>
        )}
        
        {!isOriginalReadingMode && chapter.status === 'translating' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancelTranslation}
            title={t('chapter.cancelTranslation')}
          >
            ⏹️ {t('chapter.cancelTranslate')}
          </Button>
        )}
        
        {/* Show translate button if: not completed, not translating, or completed (allow retranslation) - hidden in original reading mode */}
        {!isOriginalReadingMode && (() => {
          // Don't show translate button if currently translating
          if (chapter.status === 'translating') {
            return null;
          }
          
          // For error status, show retry button (check this first)
          if (chapter.status === 'error') {
            const titleText = estimatedTokens
              ? t('chapter.retryAfterErrorTitleWithTokens', { tokens: estimatedTokens.toLocaleString() })
              : t('chapter.retryAfterErrorTitle');
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title={titleText}
              >
                🔄 {t('chapter.retryAfterError')}{estimatedTokens ? ` (~${estimatedTokens.toLocaleString()})` : ''}
              </Button>
            );
          }
          
          // For completed chapters, always show "Перевести снова" button
          // This allows retranslation even if the chapter has a valid translation
          // Useful when paragraphs don't match due to past errors
          if (isCompleted) {
            const titleText = estimatedTokens
              ? t('chapter.translateAgainWithTokens', { tokens: estimatedTokens.toLocaleString() })
              : t('chapter.translateAgainTitle');
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title={titleText}
              >
                🔄 {t('chapter.translateAgain')}{estimatedTokens ? ` (~${estimatedTokens.toLocaleString()})` : ''}
              </Button>
            );
          }
          
          // For non-completed chapters (pending), show translate button
          if (!isCompleted) {
            const titleText = estimatedTokens 
              ? t('chapter.startTranslateTitle', { tokens: estimatedTokens.toLocaleString() })
              : t('chapter.startTranslate');
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title={titleText}
              >
                🔮 {t('chapter.translate')}{estimatedTokens ? ` (~${estimatedTokens.toLocaleString()})` : ''}
              </Button>
            );
          }
          
          return null;
        })()}
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleSettings}
          title={t('reader.displaySettings')}
        >
          ⚙️
        </Button>
      </div>
    </div>
  );
}

