import { isChapterReadByWatermark } from '../../shared/reading-progress.js';
import type {
  PublicationChapterOrder,
  PublicationReadFilter,
  PublicationTranslationFilter,
} from './publicationRoutes.js';

export type PublicationChapterFilterInput = {
  number: number;
  title?: string | null;
  hasTranslation: boolean;
};

export type FilterPublicationChaptersOptions = {
  chapterSearch: string;
  showTranslationFilter: boolean;
  translationFilter: PublicationTranslationFilter;
  chapterFilter: PublicationReadFilter;
  chapterOrder: PublicationChapterOrder;
  isAuthenticated: boolean;
  lastReadChapterNumber: number;
};

/**
 * Filter and sort publication chapter list (catalog page chips / search).
 */
export function filterAndSortPublicationChapters<T extends PublicationChapterFilterInput>(
  chapters: readonly T[],
  options: FilterPublicationChaptersOptions
): T[] {
  const {
    chapterSearch,
    showTranslationFilter,
    translationFilter,
    chapterFilter,
    chapterOrder,
    isAuthenticated,
    lastReadChapterNumber,
  } = options;

  const filtered = chapters.filter((ch) => {
    const matchesSearch =
      !chapterSearch ||
      (ch.title || '').toLowerCase().includes(chapterSearch.toLowerCase()) ||
      String(ch.number).includes(chapterSearch);
    if (!matchesSearch) return false;
    if (showTranslationFilter) {
      if (translationFilter === 'translated' && !ch.hasTranslation) return false;
      if (translationFilter === 'untranslated' && ch.hasTranslation) return false;
    }
    if (!isAuthenticated || chapterFilter === 'all') return true;
    const isRead = isChapterReadByWatermark(ch.number, lastReadChapterNumber);
    if (chapterFilter === 'read') return isRead;
    if (chapterFilter === 'unread') return !isRead;
    return true;
  });

  return [...filtered].sort((a, b) =>
    chapterOrder === 'desc' ? b.number - a.number : a.number - b.number
  );
}
