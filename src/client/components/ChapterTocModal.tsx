import { useState, useMemo, useEffect, useRef, useCallback } from 'preact/hooks';
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

  // Virtualization for large chapter lists (same pattern as ChapterList)
  const tocListRef = useRef<HTMLDivElement | null>(null);
  const [tocScrollTop, setTocScrollTop] = useState(0);
  const [tocHeight, setTocHeight] = useState(400);
  const tocRafRef = useRef<number | null>(null);
  const TOC_ITEM_HEIGHT = 52;
  const TOC_BUFFER = 6;
  const TOC_VIRTUAL_THRESHOLD = 50;

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

  const handleTocScroll = useCallback(() => {
    const el = tocListRef.current;
    if (!el) return;
    if (tocRafRef.current !== null) return;
    tocRafRef.current = requestAnimationFrame(() => {
      tocRafRef.current = null;
      setTocScrollTop(el.scrollTop);
    });
  }, []);

  // ResizeObserver for TOC list — runs when modal opens (ref is set)
  useEffect(() => {
    if (!isOpen) return;
    const el = tocListRef.current;
    if (!el) return;
    const onResize = () => setTocHeight(el.clientHeight || 400);
    onResize();
    const obs = new ResizeObserver(onResize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [isOpen]);

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
      <div class="reading-toc-list" ref={tocListRef} onScroll={handleTocScroll}>
        {filteredChapters.length === 0 ? (
          <div class="toc-empty">{t('toc.noResults')}</div>
        ) : (() => {
          const total = filteredChapters.length;
          const useVirtualization = total > TOC_VIRTUAL_THRESHOLD;
          const totalHeight = useVirtualization ? total * TOC_ITEM_HEIGHT : 0;
          const start = useVirtualization
            ? Math.max(0, Math.floor(tocScrollTop / TOC_ITEM_HEIGHT) - TOC_BUFFER)
            : 0;
          const end = useVirtualization
            ? Math.min(
                total,
                Math.ceil((tocScrollTop + tocHeight) / TOC_ITEM_HEIGHT) + TOC_BUFFER
              )
            : total;
          const visibleChapters = useVirtualization
            ? filteredChapters.slice(start, end)
            : filteredChapters;
          const paddingTop = useVirtualization ? start * TOC_ITEM_HEIGHT : 0;
          const paddingBottom = useVirtualization
            ? Math.max(0, totalHeight - end * TOC_ITEM_HEIGHT)
            : 0;

          const renderItem = (chapter: ChapterTocItem) => {
            const isActive = chapter.id === currentChapterId;
            const isRead = readChapterIds?.has(chapter.id);
            return (
              <button
                key={chapter.id}
                type="button"
                class={`reading-toc-item ${isActive ? 'active' : ''} ${isRead ? 'read' : ''}`}
                onClick={() => onSelectChapter(chapter.id)}
                style={useVirtualization ? { minHeight: TOC_ITEM_HEIGHT + 'px' } : undefined}
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
          };

          if (useVirtualization) {
            return (
              <div style={{ height: totalHeight + 'px', position: 'relative' }}>
                <div
                  style={{
                    paddingTop: paddingTop + 'px',
                    paddingBottom: paddingBottom + 'px',
                  }}
                >
                  {visibleChapters.map(renderItem)}
                </div>
              </div>
            );
          }
          return <>{visibleChapters.map(renderItem)}</>;
        })()}
      </div>
    </Modal>
  );
}
