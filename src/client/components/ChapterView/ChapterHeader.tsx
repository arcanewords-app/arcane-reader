import { useState } from 'preact/hooks';
import type { Chapter } from '../../types';
import { Button, StatusBadge } from '../ui';
import { api } from '../../api/client';

interface ChapterHeaderProps {
  chapter: Chapter;
  projectId: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTranslate: () => void;
  onApproveAll: () => void;
  onToggleSettings: () => void;
  onEnterReadingMode?: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  translating: boolean;
}

export function ChapterHeader({
  chapter,
  projectId,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onTranslate,
  onApproveAll,
  onToggleSettings,
  onEnterReadingMode,
  onChapterUpdate,
  translating,
}: ChapterHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(chapter.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const hasTranslations = chapter.paragraphs?.some((p) => p.translatedText);
  const hasTranslatedText = !!chapter.translatedText;
  const isCompleted = chapter.status === 'completed';
  const canRead = hasTranslations || hasTranslatedText;

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
        <StatusBadge status={chapter.status} />
        
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
        
        {chapter.status === 'translating' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancelTranslation}
            title="Отменить перевод"
          >
            ⏹️ Отменить
          </Button>
        )}
        
        {/* Show translate button if: not completed, not translating, or completed but empty/invalid translation */}
        {(() => {
          const hasEmptyTranslation = isCompleted && (!hasTranslatedText || !hasTranslations);
          const canRetranslate = chapter.status === 'error' || hasEmptyTranslation;
          
          if (!isCompleted && chapter.status !== 'translating') {
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating || chapter.status === 'translating'}
                disabled={translating || chapter.status === 'translating'}
                title="Начать перевод"
              >
                🔮 Перевести
              </Button>
            );
          }
          
          if (canRetranslate && chapter.status !== 'translating') {
            return (
              <Button
                size="sm"
                onClick={onTranslate}
                loading={translating || chapter.status === 'translating'}
                disabled={translating || chapter.status === 'translating'}
                title={chapter.status === 'error' ? 'Повторить перевод после ошибки' : 'Перевести заново (перевод пуст)'}
              >
                {chapter.status === 'error' ? '🔄 Повторить' : '🔄 Перевести заново'}
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

