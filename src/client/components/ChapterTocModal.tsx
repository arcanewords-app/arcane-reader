import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from './ui';
import './ChapterTocModal.css';

export interface ChapterTocItem {
  id: string;
  number: number;
  title: string;
}

interface ChapterTocModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: ChapterTocItem[];
  onSelectChapter: (chapterId: string) => void;
  currentChapterId?: string;
  title?: string;
  /** Set of chapter IDs marked as read (shows checkmark indicator). */
  readChapterIds?: Set<string>;
}

export function ChapterTocModal({
  isOpen,
  onClose,
  chapters,
  onSelectChapter,
  currentChapterId,
  title,
  readChapterIds,
}: ChapterTocModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredChapters = useMemo(() => {
    return chapters.filter((ch) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const titleMatch = (ch.title || '').toLowerCase().includes(q);
      const numberMatch = String(ch.number).includes(search);
      return titleMatch || numberMatch;
    });
  }, [chapters, search]);

  const displayTitle = title ?? `📑 ${t('readingMode.toc')}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={displayTitle}
      size="large"
      className="toc-modal chapter-toc-modal"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div class="toc-search">
        <input
          type="text"
          class="toc-search-input"
          placeholder={t('toc.searchPlaceholder')}
          value={search}
          onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="reading-toc-list">
        {filteredChapters.length === 0 ? (
          <div class="toc-empty">{t('toc.noResults')}</div>
        ) : (
          filteredChapters.map((chapter) => {
            const isActive = chapter.id === currentChapterId;
            const isRead = readChapterIds?.has(chapter.id);
            return (
              <button
                key={chapter.id}
                type="button"
                class={`reading-toc-item ${isActive ? 'active' : ''} ${isRead ? 'read' : ''}`}
                onClick={() => onSelectChapter(chapter.id)}
              >
                <span class="reading-toc-number">{chapter.number}</span>
                <span class="reading-toc-title">
                  {chapter.title ||
                    t('chapterList.defaultChapterTitle', { number: chapter.number })}
                </span>
                {isRead && (
                  <span class="reading-toc-read" title={t('publication.read')}>
                    ✓
                  </span>
                )}
                {isActive && <span class="reading-toc-current">{t('readingMode.current')}</span>}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
