import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { Paragraph } from '../../types';
import { Icon, Button } from '../ui';
import { searchInParagraphs, replaceInText, type SearchMatch } from '../../utils/search-utils';
import { ReplacePreviewModal, type ReplacePreviewItem } from './ReplacePreviewModal';
import './SearchReplace.css';

const DEBOUNCE_MS = 250;
const MAX_FIND_LENGTH = 2000;

export interface SearchHighlight {
  paragraphIds: string[];
  currentParagraphId: string | null;
}

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
  const [find, setFind] = useState(initialFind);
  const [replace, setReplace] = useState('');
  const [debouncedFind, setDebouncedFind] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Debounce find input
  useEffect(() => {
    const trimmed = find.trim().slice(0, MAX_FIND_LENGTH);
    const id = setTimeout(() => setDebouncedFind(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [find]);

  // Search in paragraphs
  const matches = useMemo(() => {
    if (!debouncedFind) return [];
    const field = isOriginalReadingMode ? 'original' : 'translated';
    return searchInParagraphs(paragraphs, debouncedFind, field, caseSensitive);
  }, [paragraphs, debouncedFind, isOriginalReadingMode, caseSensitive]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset currentIndex when matches change
  useEffect(() => {
    setCurrentIndex(0);
  }, [debouncedFind]);

  // Clamp currentIndex when matches shrink
  useEffect(() => {
    if (matches.length > 0 && currentIndex >= matches.length) {
      setCurrentIndex(matches.length - 1);
    }
  }, [matches.length, currentIndex]);

  // Notify parent of highlight state
  useEffect(() => {
    if (matches.length === 0) {
      onHighlightChange({ paragraphIds: [], currentParagraphId: null });
    } else {
      const ids = [...new Set(matches.map((m) => m.paragraphId))];
      const current = matches[currentIndex];
      onHighlightChange({
        paragraphIds: ids,
        currentParagraphId: current ? current.paragraphId : null,
      });
    }
  }, [matches, currentIndex, onHighlightChange]);

  const handlePrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
  }, [matches.length]);

  const handleNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i >= matches.length - 1 ? 0 : i + 1));
  }, [matches.length]);

  const handleRowClick = useCallback(
    (m: SearchMatch, idx: number) => {
      setCurrentIndex(idx);
      onScrollToRequest?.(m.paragraphId);
    },
    [onScrollToRequest]
  );

  const [showPreview, setShowPreview] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const hasMatches = matches.length > 0;
  const canReplace =
    !!onReplace &&
    !isOriginalReadingMode &&
    !!debouncedFind &&
    replace.trim() !== debouncedFind &&
    hasMatches;

  const handleReplace = useCallback(async () => {
    if (!onReplace || !hasMatches || isOriginalReadingMode) return;
    const m = matches[currentIndex];
    const newText = replaceInText(m.fullText, debouncedFind, replace, false, caseSensitive);
    if (newText === m.fullText) return;
    setReplacing(true);
    try {
      await onReplace(m.paragraphId, newText);
    } finally {
      setReplacing(false);
    }
  }, [
    onReplace,
    matches,
    currentIndex,
    debouncedFind,
    replace,
    caseSensitive,
    isOriginalReadingMode,
    hasMatches,
  ]);

  const previewItems = useMemo((): ReplacePreviewItem[] => {
    if (!debouncedFind || !hasMatches) return [];
    const byPara = new Map<string, Paragraph>();
    for (const p of paragraphs) {
      byPara.set(p.id, p);
    }
    const seen = new Set<string>();
    const items: ReplacePreviewItem[] = [];
    for (const m of matches) {
      if (seen.has(m.paragraphId)) continue;
      seen.add(m.paragraphId);
      const p = byPara.get(m.paragraphId);
      if (!p) continue;
      const text = m.field === 'translated' ? p.translatedText || '' : p.originalText || '';
      const after = replaceInText(text, debouncedFind, replace, true, caseSensitive);
      if (after !== text) {
        items.push({
          paragraphId: m.paragraphId,
          paragraphIndex: m.paragraphIndex,
          before: text.slice(0, 150) + (text.length > 150 ? '…' : ''),
          after: after.slice(0, 150) + (after.length > 150 ? '…' : ''),
        });
      }
    }
    return items;
  }, [paragraphs, matches, debouncedFind, replace, caseSensitive, hasMatches]);

  const handleReplaceAll = useCallback(async () => {
    if (!onReplace || !hasMatches || isOriginalReadingMode) return;
    setShowPreview(true);
  }, [onReplace, hasMatches, isOriginalReadingMode]);

  const handleConfirmReplaceAll = useCallback(async () => {
    if (!onReplace || previewItems.length === 0) return;
    setReplacing(true);
    try {
      const byPara = new Map(paragraphs.map((p) => [p.id, p]));
      for (const item of previewItems) {
        const p = byPara.get(item.paragraphId);
        if (!p) continue;
        const text = isOriginalReadingMode ? p.originalText : p.translatedText || '';
        const after = replaceInText(text, debouncedFind, replace, true, caseSensitive);
        if (after !== text) {
          await onReplace(item.paragraphId, after);
        }
      }
      setShowPreview(false);
    } finally {
      setReplacing(false);
    }
  }, [
    onReplace,
    previewItems,
    paragraphs,
    debouncedFind,
    replace,
    caseSensitive,
    isOriginalReadingMode,
  ]);

  return (
    <div class="search-replace-bar">
      <div class="search-replace-row">
        <div class="search-replace-inputs">
          <div class="search-replace-find form-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              class="form-input"
              placeholder={t('searchReplace.findPlaceholder', 'Find')}
              value={find}
              onInput={(e) => setFind((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    handlePrev();
                  } else {
                    handleNext();
                  }
                }
              }}
              maxLength={MAX_FIND_LENGTH}
              aria-label={t('searchReplace.findPlaceholder', 'Find')}
            />
          </div>
          <div class="search-replace-replace form-group" style={{ marginBottom: 0 }}>
            <input
              type="text"
              class="form-input"
              placeholder={t('searchReplace.replacePlaceholder', 'Replace')}
              value={replace}
              onInput={(e) => setReplace((e.target as HTMLInputElement).value)}
              maxLength={MAX_FIND_LENGTH}
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
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive((e.target as HTMLInputElement).checked)}
            />
            {t('searchReplace.caseSensitive', 'Aa')}
          </label>
        </div>
        <div class="search-replace-actions">
          <div class="search-replace-nav">
            <button
              type="button"
              class="search-replace-nav-btn"
              onClick={handlePrev}
              disabled={!hasMatches}
              title={t('searchReplace.prevMatch', 'Previous match')}
              aria-label={t('searchReplace.prevMatch', 'Previous match')}
            >
              <Icon name="chevron_left" size="sm" />
            </button>
            <button
              type="button"
              class="search-replace-nav-btn"
              onClick={handleNext}
              disabled={!hasMatches}
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
                onClick={handleReplace}
                disabled={!canReplace || replacing}
                loading={replacing}
              >
                {t('searchReplace.replace', 'Replace')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReplaceAll}
                disabled={!canReplace || replacing}
              >
                {t('searchReplace.replaceAll', 'Replace all')}
              </Button>
            </>
          )}
          <span class="search-replace-count">
            {debouncedFind
              ? hasMatches
                ? t(
                    'searchReplace.matchCount',
                    { current: currentIndex + 1, total: matches.length },
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

      {debouncedFind && (
        <div class="search-results-table">
          {hasMatches ? (
            <>
              <div class="search-results-header">
                {t('searchReplace.resultsCount', { count: matches.length }, '{{count}} matches')}
              </div>
              {matches.map((m, idx) => (
                <div
                  key={`${m.paragraphId}-${idx}`}
                  class={`search-results-row ${idx === currentIndex ? 'is-current' : ''}`}
                  onClick={() => handleRowClick(m, idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(m, idx);
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
        isOpen={showPreview}
        onClose={() => !replacing && setShowPreview(false)}
        items={previewItems}
        onConfirm={handleConfirmReplaceAll}
        isReplacing={replacing}
      />
    </div>
  );
}
