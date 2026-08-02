import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import type { Paragraph } from '../../types.js';
import { searchInParagraphs, replaceInText, type SearchMatch } from '../../utils/search-utils.js';
import type { ReplacePreviewItem } from './ReplacePreviewModal.js';

export const CHAPTER_SEARCH_DEBOUNCE_MS = 250;
export const CHAPTER_SEARCH_MAX_FIND_LENGTH = 2000;

export interface SearchHighlight {
  paragraphIds: string[];
  currentParagraphId: string | null;
}

export interface UseChapterSearchReplaceOptions {
  paragraphs: Paragraph[];
  isOriginalReadingMode: boolean;
  onHighlightChange: (highlight: SearchHighlight) => void;
  /** Called when user clicks a search result row — parent should scroll to that paragraph */
  onScrollToRequest?: (paragraphId: string) => void;
  /** For Phase 2: replace callbacks. Omit for Phase 1 (find only). */
  onReplace?: (paragraphId: string, newText: string) => Promise<void>;
  /** Pre-fill search query (e.g. from report description when navigating from ReportsModal). */
  initialFind?: string;
}

export function useChapterSearchReplace({
  paragraphs,
  isOriginalReadingMode,
  onHighlightChange,
  onScrollToRequest,
  onReplace,
  initialFind = '',
}: UseChapterSearchReplaceOptions) {
  const [find, setFind] = useState(initialFind);
  const [replace, setReplace] = useState('');
  const [debouncedFind, setDebouncedFind] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  useEffect(() => {
    setFind(initialFind);
  }, [initialFind]);

  useEffect(() => {
    const trimmed = find.trim().slice(0, CHAPTER_SEARCH_MAX_FIND_LENGTH);
    const id = setTimeout(() => setDebouncedFind(trimmed), CHAPTER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [find]);

  const matches = useMemo(() => {
    if (!debouncedFind) return [];
    const field = isOriginalReadingMode ? 'original' : 'translated';
    return searchInParagraphs(paragraphs, debouncedFind, field, caseSensitive);
  }, [paragraphs, debouncedFind, isOriginalReadingMode, caseSensitive]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [debouncedFind]);

  useEffect(() => {
    if (matches.length > 0 && currentIndex >= matches.length) {
      setCurrentIndex(matches.length - 1);
    }
  }, [matches.length, currentIndex]);

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

  return {
    find,
    setFind,
    replace,
    setReplace,
    debouncedFind,
    caseSensitive,
    setCaseSensitive,
    matches,
    currentIndex,
    hasMatches,
    canReplace,
    replacing,
    showPreview,
    setShowPreview,
    previewItems,
    handlePrev,
    handleNext,
    handleRowClick,
    handleReplace,
    handleReplaceAll,
    handleConfirmReplaceAll,
    onReplace,
    isOriginalReadingMode,
  };
}
