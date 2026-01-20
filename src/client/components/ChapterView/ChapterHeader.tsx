import { useState } from 'preact/hooks';
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
  onTranslateEmpty?: () => void; // New handler for translating empty paragraphs
  onApproveAll: () => void;
  onToggleSettings: () => void;
  onEnterReadingMode?: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  translating: boolean;
  isOriginalReadingMode?: boolean;
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
  onApproveAll,
  onToggleSettings,
  onEnterReadingMode,
  onChapterUpdate,
  translating,
  isOriginalReadingMode = false,
}: ChapterHeaderProps) {
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
          title="Предыдущая глава"
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
                title="Сохранить (Enter)"
              >
                ✓
              </button>
              <button
                class="chapter-title-cancel-btn"
                onClick={handleCancelEdit}
                disabled={savingTitle}
                title="Отмена (Esc)"
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
              title="Редактировать название"
            >
              ✏️
            </button>
          </div>
        )}
        <button
          class="chapter-nav-btn"
          disabled={!canNext}
          onClick={onNext}
          title="Следующая глава"
        >
          ▶
        </button>
      </div>

      <div class="chapter-actions">
        {!isOriginalReadingMode && (
          <StatusBadge status={chapter.status} />
        )}
        
        {canRead && onEnterReadingMode && (
          <Button variant="secondary" size="sm" onClick={onEnterReadingMode} title="Режим чтения">
            📖 Читать
          </Button>
        )}
        
        {hasTranslations && !isCompleted && (
          <Button variant="secondary" size="sm" onClick={onApproveAll}>
            ✅ Одобрить всё
          </Button>
        )}
        
        {/* Translate empty paragraphs button - show if chapter has some translations but also empty paragraphs */}
        {!isOriginalReadingMode && hasEmptyParagraphs && hasTranslations && chapter.status !== 'translating' && onTranslateEmpty && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onTranslateEmpty}
            disabled={translating}
            title={`Перевести ${emptyParagraphs.length} пустых абзацев`}
          >
            🔮 Перевести пустые абзацы ({emptyParagraphs.length})
          </Button>
        )}
        
        {!isOriginalReadingMode && chapter.status === 'translating' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancelTranslation}
            title="Отменить перевод"
          >
            ⏹️ Отменить
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
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title="Повторить перевод после ошибки"
              >
                🔄 Повторить
              </Button>
            );
          }
          
          // For completed chapters, always show "Перевести снова" button
          // This allows retranslation even if the chapter has a valid translation
          // Useful when paragraphs don't match due to past errors
          if (isCompleted) {
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title="Перевести главу заново (полезно, если параграфы не совпадают из-за прошлых ошибок)"
              >
                🔄 Перевести снова
              </Button>
            );
          }
          
          // For non-completed chapters (pending), show "Перевести" button
          if (!isCompleted) {
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating}
                disabled={translating}
                title="Начать перевод"
              >
                🔮 Перевести
              </Button>
            );
          }
          
          return null;
        })()}
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleSettings}
          title="Настройки отображения"
        >
          ⚙️
        </Button>
      </div>
    </div>
  );
}

