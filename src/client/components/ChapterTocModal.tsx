import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Icon } from './ui';
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
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Reset search and filter when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setFilter('all');
    }
  }, [isOpen]);

  const filteredChapters = useMemo(() => {
    let filtered = chapters.filter((ch) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const titleMatch = (ch.title || '').toLowerCase().includes(q);
      const numberMatch = String(ch.number).includes(search);
      return titleMatch || numberMatch;
    });
    if (readChapterIds) {
      if (filter === 'read') {
        filtered = filtered.filter((ch) => readChapterIds.has(ch.id));
      } else if (filter === 'unread') {
        filtered = filtered.filter((ch) => !readChapterIds.has(ch.id));
      }
    }
    return [...filtered].sort((a, b) =>
      order === 'desc' ? b.number - a.number : a.number - b.number
    );
  }, [chapters, search, order, filter, readChapterIds]);

  const displayTitle = title ?? t('readingMode.toc');

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
        <div class="toc-order-btns">
          <button
            type="button"
            class={`toc-order-btn ${order === 'asc' ? 'active' : ''}`}
            onClick={() => setOrder('asc')}
          >
            {t('publication.orderFromStart')}
          </button>
          <button
            type="button"
            class={`toc-order-btn ${order === 'desc' ? 'active' : ''}`}
            onClick={() => setOrder('desc')}
          >
            {t('publication.orderFromEnd')}
          </button>
        </div>
        {readChapterIds && (
          <div class="toc-filter-btns">
            <button
              type="button"
              class={`toc-order-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              {t('publication.filterAll')}
            </button>
            <button
              type="button"
              class={`toc-order-btn ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              {t('publication.filterUnread')}
            </button>
            <button
              type="button"
              class={`toc-order-btn ${filter === 'read' ? 'active' : ''}`}
              onClick={() => setFilter('read')}
            >
              {t('publication.filterRead')}
            </button>
          </div>
        )}
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
                    <Icon name="check" size="sm" />
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
