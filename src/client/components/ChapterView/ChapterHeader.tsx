import type { Chapter } from '../../types';
import { Button, StatusBadge } from '../ui';

interface ChapterHeaderProps {
  chapter: Chapter;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTranslate: () => void;
  onApproveAll: () => void;
  onToggleSettings: () => void;
  translating: boolean;
}

export function ChapterHeader({
  chapter,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onTranslate,
  onApproveAll,
  onToggleSettings,
  translating,
}: ChapterHeaderProps) {
  const hasTranslations = chapter.paragraphs?.some((p) => p.translatedText);
  const isCompleted = chapter.status === 'completed';

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
        <h2 class="chapter-title">{chapter.title}</h2>
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
        
        {hasTranslations && !isCompleted && (
          <Button variant="secondary" size="sm" onClick={onApproveAll}>
            ✅ Одобрить всё
          </Button>
        )}
        
        <Button
          size="sm"
          onClick={onTranslate}
          loading={translating}
          disabled={translating || chapter.status === 'translating'}
        >
          🔮 Перевести
        </Button>
        
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

