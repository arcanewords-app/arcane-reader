export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export const CHAPTER_PICKER_SEARCH_THRESHOLD = 100;

export type StatusFilter =
  'all' | 'empty' | 'error' | 'completed' | 'partial' | 'draft' | 'analyzed' | 'not_analyzed';

export interface ChapterPickerItem {
  id: string;
  number: number;
  title: string;
  status?: string;
  translatedTitle?: string;
  hasTranslation?: boolean;
  lastAnalysisAt?: string;
  translationMeta?: { lastAnalysisAt?: string };
  paragraphCount?: number;
  translatedParagraphCount?: number;
}

export interface ChapterPickerStats {
  chapters: number;
  translated: number;
  partial: number;
  draft: number;
  analyzed: number;
  error: number;
  empty: number;
  notAnalyzed: number;
}

export function presetButtonStyle(filter: StatusFilter): Record<string, string> {
  const base = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    textDecoration: 'underline',
    borderRadius: '6px',
  };
  const color =
    filter === 'error'
      ? 'var(--error)'
      : filter === 'partial'
        ? 'var(--warning)'
        : filter === 'draft' || filter === 'analyzed' || filter === 'not_analyzed'
          ? 'var(--accent)'
          : 'var(--text-dim)';
  return { ...base, color };
}

export function hasLastAnalysis(c: {
  lastAnalysisAt?: string;
  translationMeta?: { lastAnalysisAt?: string };
}): boolean {
  return !!(c.lastAnalysisAt ?? c.translationMeta?.lastAnalysisAt);
}

export function toChapterPickerItem(c: ChapterPickerItem): ChapterPickerItem & {
  hasTranslation: boolean;
} {
  if ('hasTranslation' in c && typeof c.hasTranslation === 'boolean') {
    return { ...c, hasTranslation: c.hasTranslation };
  }
  const status = c.status ?? 'pending';
  const hasTranslation = status === 'completed' || status === 'draft' || status === 'partial';
  return { ...c, hasTranslation };
}

export function getChapterHasTranslation(c: ChapterPickerItem): boolean {
  return toChapterPickerItem(c).hasTranslation;
}

export function filterChaptersByStatus<T extends ChapterPickerItem>(
  list: T[],
  statusFilter: StatusFilter,
  hasLastAnalysisFn: (c: T) => boolean = hasLastAnalysis
): T[] {
  if (statusFilter === 'all') return list;
  return list.filter((c) => {
    const hasTranslation = getChapterHasTranslation(c);
    switch (statusFilter) {
      case 'empty':
        return !hasTranslation;
      case 'error':
        return c.status === 'error';
      case 'completed':
        return c.status === 'completed';
      case 'partial':
        return c.status === 'partial';
      case 'draft':
        return c.status === 'draft';
      case 'analyzed':
        return c.status === 'analyzed';
      case 'not_analyzed':
        return !hasLastAnalysisFn(c);
      default:
        return true;
    }
  });
}

export function computeChapterPickerStats(chapters: ChapterPickerItem[]): ChapterPickerStats {
  const notAnalyzedCount = chapters.filter((c) => !hasLastAnalysis(c)).length;
  return {
    chapters: chapters.length,
    translated: chapters.filter((c) => c.status === 'completed').length,
    partial: chapters.filter((c) => c.status === 'partial').length,
    draft: chapters.filter((c) => c.status === 'draft').length,
    analyzed: chapters.filter((c) => c.status === 'analyzed').length,
    error: chapters.filter((c) => c.status === 'error').length,
    empty: chapters.filter((c) => !getChapterHasTranslation(c)).length,
    notAnalyzed: notAnalyzedCount,
  };
}

export function getChapterIdsForPreset(
  chapters: ChapterPickerItem[],
  statusFilter: StatusFilter
): string[] {
  if (statusFilter === 'all') return [];
  return filterChaptersByStatus(chapters, statusFilter).map((c) => c.id);
}
