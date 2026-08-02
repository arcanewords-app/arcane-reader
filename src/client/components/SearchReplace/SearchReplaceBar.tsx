import { useTranslation } from 'react-i18next';
import type { Paragraph } from '../../types';
import { Icon, Button } from '../ui';
import { ReplacePreviewModal } from './ReplacePreviewModal';
import {
  CHAPTER_SEARCH_MAX_FIND_LENGTH,
  useChapterSearchReplace,
  type SearchHighlight,
} from './useChapterSearchReplace';
import './SearchReplace.css';

export type { SearchHighlight };

interface SearchReplaceBarProps {
  paragraphs: Paragraph[];
  isOriginalReadingMode: boolean;
  onClose: () => void;
  onHighlightChange: (highlight: SearchHighlight) => void;
  /** Called when user clicks a search result row — parent should scroll to that paragraph */
  onScrollToRequest?: (paragraphId: string) => void;
  /** For Phase 2: replace callbacks. Omit for Phase 1 (find only). */
  onReplace?: (paragraphId: string, newText: string) => Promise<void>;
  /** Pre-fill search query (e.g. from report description when navigating from ReportsModal). */
  initialFind?: string;
}

export function SearchReplaceBar({
  paragraphs,
  isOriginalReadingMode,
  onClose,
  onHighlightChange,
  onScrollToRequest,
  onReplace,
  initialFind = '',
}: SearchReplaceBarProps) {
  const { t } = useTranslation();

  const search = useChapterSearchReplace({
    paragraphs,
    isOriginalReadingMode,
    onHighlightChange,
    onScrollToRequest,
    onReplace,
    initialFind,
  });

  return (
    <div class="search-replace-bar">
      <div class="search-replace-row">
        <div class="search-replace-inputs">
          <div class="search-replace-find form-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              class="form-input"
              placeholder={t('searchReplace.findPlaceholder', 'Find')}
              value={search.find}
              onInput={(e) => search.setFind((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    search.handlePrev();
                  } else {
                    search.handleNext();
                  }
                }
              }}
              maxLength={CHAPTER_SEARCH_MAX_FIND_LENGTH}
              aria-label={t('searchReplace.findPlaceholder', 'Find')}
            />
          </div>
          <div class="search-replace-replace form-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              class="form-input"
              placeholder={t('searchReplace.replacePlaceholder', 'Replace')}
              value={search.replace}
              onInput={(e) => search.setReplace((e.target as HTMLInputElement).value)}
              maxLength={CHAPTER_SEARCH_MAX_FIND_LENGTH}
              aria-label={t('searchReplace.replacePlaceholder', 'Replace')}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={search.caseSensitive}
              onChange={(e) => search.setCaseSensitive((e.target as HTMLInputElement).checked)}
            />
            {t('searchReplace.caseSensitive', 'Aa')}
          </label>
        </div>
        <div class="search-replace-actions">
          <div class="search-replace-nav">
            <button
              type="button"
              class="search-replace-nav-btn"
              onClick={search.handlePrev}
              disabled={!search.hasMatches}
              title={t('searchReplace.prevMatch', 'Previous match')}
              aria-label={t('searchReplace.prevMatch', 'Previous match')}
            >
              <Icon name="chevron_left" size="sm" />
            </button>
            <button
              type="button"
              class="search-replace-nav-btn"
              onClick={search.handleNext}
              disabled={!search.hasMatches}
              title={t('searchReplace.nextMatch', 'Next match')}
              aria-label={t('searchReplace.nextMatch', 'Next match')}
            >
              <Icon name="chevron_right" size="sm" />
            </button>
          </div>
          {onReplace && !isOriginalReadingMode && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void search.handleReplace()}
                disabled={!search.canReplace || search.replacing}
                loading={search.replacing}
              >
                {t('searchReplace.replace', 'Replace')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void search.handleReplaceAll()}
                disabled={!search.canReplace || search.replacing}
              >
                {t('searchReplace.replaceAll', 'Replace all')}
              </Button>
            </>
          )}
          <span class="search-replace-count">
            {search.debouncedFind
              ? search.hasMatches
                ? t(
                    'searchReplace.matchCount',
                    { current: search.currentIndex + 1, total: search.matches.length },
                    '{{current}} / {{total}}'
                  )
                : t('searchReplace.noMatches', 'No matches')
              : ''}
          </span>
          <button
            type="button"
            class="search-replace-close"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      </div>

      {search.debouncedFind && (
        <div class="search-results-table">
          {search.hasMatches ? (
            <>
              <div class="search-results-header">
                {t(
                  'searchReplace.resultsCount',
                  { count: search.matches.length },
                  '{{count}} matches'
                )}
              </div>
              {search.matches.map((m, idx) => (
                <div
                  key={`${m.paragraphId}-${idx}`}
                  class={`search-results-row ${idx === search.currentIndex ? 'is-current' : ''}`}
                  onClick={() => search.handleRowClick(m, idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      search.handleRowClick(m, idx);
                    }
                  }}
                >
                  <span class="search-result-index">{idx + 1}</span>
                  <span class="search-result-para">#{m.paragraphIndex}</span>
                  <span
                    class="search-result-snippet"
                    dangerouslySetInnerHTML={{ __html: m.snippetHtml }}
                  />
                </div>
              ))}
            </>
          ) : (
            <div class="search-results-empty">{t('searchReplace.noMatches', 'No matches')}</div>
          )}
        </div>
      )}

      <ReplacePreviewModal
        isOpen={search.showPreview}
        onClose={() => !search.replacing && search.setShowPreview(false)}
        items={search.previewItems}
        onConfirm={() => void search.handleConfirmReplaceAll()}
        isReplacing={search.replacing}
      />
    </div>
  );
}
