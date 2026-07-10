import { useState, useMemo, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Icon, Input, LoadingSpinner } from '../ui';
import { chapterDisplayTitle, chapterMatchesListSearch } from '../../../shared/chapterTitle';
import {
  PAGE_SIZE_OPTIONS,
  CHAPTER_PICKER_SEARCH_THRESHOLD,
  presetButtonStyle,
  filterChaptersByStatus,
  computeChapterPickerStats,
  getChapterIdsForPreset,
  getChapterHasTranslation,
  hasLastAnalysis,
  type ChapterPickerItem,
  type StatusFilter,
} from './chapterPickerShared';
import '../Sidebar/ProcessChapters.css';

interface ChapterPickerStatusBadgeProps {
  chapter: ChapterPickerItem;
}

function ChapterPickerStatusBadge({ chapter }: ChapterPickerStatusBadgeProps) {
  const { t } = useTranslation();
  const isEmpty = !getChapterHasTranslation(chapter);
  const isError = chapter.status === 'error';
  const isCompleted = chapter.status === 'completed';
  const isPartial = chapter.status === 'partial';
  const isDraft = chapter.status === 'draft';
  const isAnalyzed = chapter.status === 'analyzed';

  if (!isEmpty && !isError && !isCompleted && !isPartial && !isDraft && !isAnalyzed) {
    return null;
  }

  const paragraphCount = chapter.paragraphCount ?? 0;
  const translatedParagraphCount = chapter.translatedParagraphCount ?? 0;
  const paragraphProgress =
    paragraphCount > 0 && translatedParagraphCount < paragraphCount
      ? t('projectInfo.chapterParagraphProgress', {
          translated: translatedParagraphCount,
          total: paragraphCount,
        })
      : null;

  return (
    <span
      style={{
        fontSize: '0.7rem',
        padding: '0.1rem 0.35rem',
        borderRadius: '4px',
        background: isError
          ? 'var(--error)'
          : isCompleted
            ? 'var(--success)'
            : isPartial
              ? 'var(--warning-muted, rgba(245, 158, 11, 0.25))'
              : isDraft
                ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                : isAnalyzed
                  ? 'var(--accent-muted, rgba(139, 92, 246, 0.25))'
                  : 'var(--text-dim)',
        color:
          isError || isCompleted
            ? 'white'
            : isPartial
              ? 'var(--warning)'
              : isDraft || isAnalyzed
                ? 'var(--accent)'
                : 'var(--bg-secondary)',
        flexShrink: 0,
      }}
      title={
        isError
          ? t('projectInfo.chapterStatusError')
          : isCompleted
            ? t('projectInfo.chapterStatusTranslated')
            : isPartial
              ? paragraphProgress
                ? `${t('projectInfo.chapterStatusPartial')} (${paragraphProgress})`
                : t('projectInfo.chapterStatusPartial')
              : isDraft
                ? t('projectInfo.chapterStatusDraft')
                : isAnalyzed
                  ? t('projectInfo.chapterStatusAnalyzed', 'Только анализ')
                  : t('projectInfo.chapterStatusEmpty')
      }
    >
      {isError ? (
        <Icon name="error" size="sm" />
      ) : isCompleted ? (
        <Icon name="check" size="sm" />
      ) : isPartial ? (
        paragraphProgress || <Icon name="warning" size="sm" />
      ) : isDraft ? (
        <Icon name="edit_note" size="sm" />
      ) : isAnalyzed ? (
        <Icon name="manage_search" size="sm" />
      ) : (
        <Icon name="radio_button_unchecked" size="sm" />
      )}
    </span>
  );
}

export interface ChapterPickerPanelProps {
  chapters: ChapterPickerItem[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[] | ((prev: string[]) => string[])) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Bump to reset internal filter/page/search when parent modal opens */
  resetKey?: number;
  initialStatusFilter?: StatusFilter;
}

export function ChapterPickerPanel({
  chapters,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
  loading = false,
  resetKey = 0,
  initialStatusFilter = 'all',
}: ChapterPickerPanelProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
    setSearchQuery('');
    setCurrentPage(1);
  }, [resetKey, initialStatusFilter]);

  const stats = useMemo(() => computeChapterPickerStats(chapters), [chapters]);

  const filteredChapters = useMemo(() => {
    let list = filterChaptersByStatus(chapters, statusFilter, hasLastAnalysis);
    const q = searchQuery.trim();
    if (q) {
      list = list.filter((c) => chapterMatchesListSearch(c, q));
    }
    return list;
  }, [chapters, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredChapters.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const paginatedChapters = useMemo(
    () => filteredChapters.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [filteredChapters, clampedPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage((p) => (p > totalPages ? totalPages : p));
  }, [totalPages]);

  const applyPreset = (filter: StatusFilter) => {
    setStatusFilter(filter);
    setCurrentPage(1);
    if (filter !== 'all') {
      onSelectedIdsChange(getChapterIdsForPreset(chapters, filter));
    }
  };

  const controlsDisabled = disabled || loading;

  return (
    <>
      <div class="process-chapters-selection-row">
        <div class="process-chapters-selection-actions">
          <button
            type="button"
            class="process-chapters-link-btn"
            disabled={controlsDisabled}
            onClick={() => onSelectedIdsChange(filteredChapters.map((c) => c.id))}
          >
            {t('chapter.selectAll')}
          </button>
          <button
            type="button"
            class="process-chapters-link-btn process-chapters-link-btn-dim"
            disabled={controlsDisabled}
            onClick={() => onSelectedIdsChange([])}
          >
            {t('chapter.deselectAll')}
          </button>
        </div>
        <span class="process-chapters-separator">|</span>
        <div class="process-chapters-filter-presets">
          <button
            type="button"
            class={statusFilter === 'all' ? 'process-chapters-preset-active' : ''}
            disabled={controlsDisabled}
            onClick={() => applyPreset('all')}
            style={presetButtonStyle('all')}
          >
            {t(
              'processChapters.filterAllWithCount',
              { count: stats.chapters },
              `All (${stats.chapters})`
            )}
          </button>
          <button
            type="button"
            class={statusFilter === 'empty' ? 'process-chapters-preset-active' : ''}
            disabled={controlsDisabled}
            onClick={() => applyPreset('empty')}
            style={presetButtonStyle('empty')}
          >
            {t('projectInfo.presetEmpty', { count: stats.empty }, 'Пустые ({{count}})')}
          </button>
          {stats.error > 0 && (
            <button
              type="button"
              class={statusFilter === 'error' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('error')}
              style={presetButtonStyle('error')}
            >
              {t('projectInfo.presetErrors', { count: stats.error }, 'С ошибками ({{count}})')}
            </button>
          )}
          {stats.translated > 0 && (
            <button
              type="button"
              class={statusFilter === 'completed' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('completed')}
              style={presetButtonStyle('completed')}
            >
              {t(
                'projectInfo.presetTranslated',
                { count: stats.translated },
                'Переведённые ({{count}})'
              )}
            </button>
          )}
          {stats.partial > 0 && (
            <button
              type="button"
              class={statusFilter === 'partial' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('partial')}
              style={presetButtonStyle('partial')}
            >
              {t('projectInfo.presetPartial', { count: stats.partial }, 'Неполные ({{count}})')}
            </button>
          )}
          {stats.draft > 0 && (
            <button
              type="button"
              class={statusFilter === 'draft' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('draft')}
              style={presetButtonStyle('draft')}
            >
              {t('projectInfo.presetDraft', { count: stats.draft }, 'Черновики ({{count}})')}
            </button>
          )}
          {stats.analyzed > 0 && (
            <button
              type="button"
              class={statusFilter === 'analyzed' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('analyzed')}
              style={presetButtonStyle('analyzed')}
            >
              {t(
                'projectInfo.presetAnalyzed',
                { count: stats.analyzed },
                'Только анализ ({{count}})'
              )}
            </button>
          )}
          {stats.notAnalyzed > 0 && (
            <button
              type="button"
              class={statusFilter === 'not_analyzed' ? 'process-chapters-preset-active' : ''}
              disabled={controlsDisabled}
              onClick={() => applyPreset('not_analyzed')}
              style={presetButtonStyle('not_analyzed')}
            >
              {t(
                'projectInfo.presetNotAnalyzed',
                { count: stats.notAnalyzed },
                'Не проанализированные ({{count}})'
              )}
            </button>
          )}
        </div>
        {chapters.length >= CHAPTER_PICKER_SEARCH_THRESHOLD && (
          <div class="process-chapters-search-wrap">
            <Input
              type="search"
              className="process-chapters-search"
              placeholder={t('processChapters.searchPlaceholder', 'Search by number or title')}
              value={searchQuery}
              disabled={controlsDisabled}
              onInput={(e) => {
                setSearchQuery((e.target as HTMLInputElement).value);
                setCurrentPage(1);
              }}
              aria-label={t('processChapters.searchPlaceholder', 'Search by number or title')}
            />
          </div>
        )}
      </div>

      <div class="process-chapters-pagination-row">
        <label class="process-chapters-per-page">
          {t('processChapters.perPage', 'Per page')}
          <select
            value={pageSize}
            disabled={controlsDisabled}
            onChange={(e) => {
              setPageSize(Number((e.target as HTMLSelectElement).value));
              setCurrentPage(1);
            }}
            class="process-chapters-per-page-select"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          class="process-chapters-select-displayed-btn"
          disabled={controlsDisabled || paginatedChapters.length === 0}
          onClick={() => {
            const idsToAdd = paginatedChapters.map((c) => c.id);
            onSelectedIdsChange((prev) => [...new Set([...prev, ...idsToAdd])]);
          }}
        >
          {t(
            'processChapters.selectDisplayed',
            { count: paginatedChapters.length },
            `Select displayed (${paginatedChapters.length})`
          )}
        </button>
        {totalPages > 1 && (
          <span class="process-chapters-page-nav">
            <button
              type="button"
              class="process-chapters-nav-btn"
              disabled={controlsDisabled || clampedPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              {t('chapter.prev', 'Previous')}
            </button>
            <span class="process-chapters-page-of">
              {t(
                'processChapters.pageOf',
                { current: clampedPage, total: totalPages },
                'Page {{current}} of {{total}}'
              )}
            </span>
            <button
              type="button"
              class="process-chapters-nav-btn"
              disabled={controlsDisabled || clampedPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('chapter.next', 'Next')}
            </button>
          </span>
        )}
      </div>

      <div
        style={{
          maxHeight: '280px',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          marginBottom: '0.75rem',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '120px',
              padding: '1rem',
            }}
          >
            <LoadingSpinner size="sm" text={t('common.loading')} />
          </div>
        ) : chapters.length === 0 ? (
          <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {t('projectInfo.noChaptersInProject')}
          </div>
        ) : filteredChapters.length === 0 ? (
          <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {t('chapterList.noResults', 'No results')}
          </div>
        ) : (
          paginatedChapters.map((chapter, index) => {
            const checked = selectedIds.includes(chapter.id);
            const isLast = index === paginatedChapters.length - 1;
            return (
              <label
                key={chapter.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.75rem',
                  cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  margin: 0,
                  opacity: controlsDisabled ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={controlsDisabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSelectedIdsChange((prev) =>
                      prev.includes(chapter.id)
                        ? prev.filter((id) => id !== chapter.id)
                        : [...prev, chapter.id]
                    );
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                />
                <span
                  style={{
                    minWidth: '1.5rem',
                    fontSize: '0.85rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  {chapter.number}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chapterDisplayTitle(chapter)}
                </span>
                <ChapterPickerStatusBadge chapter={chapter} />
              </label>
            );
          })
        )}
      </div>
    </>
  );
}
