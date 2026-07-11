import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import type { ChapterListItem, ProjectSearchMatch, TextBlockType } from '../../types';
import { api } from '../../api/client';
import {
  dedupeParagraphMatches,
  filterProjectMatches,
  paragraphMatchKey,
  replaceInText,
} from '../../utils/search-utils';
import { bulkReplaceParagraphsChunked } from './bulkReplaceChunked';
import type { ReplacePreviewItem } from './ReplacePreviewModal';

const PROJECT_SEARCH_DEBOUNCE_MS = 600;

function parseChapterBound(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export interface UseProjectSearchOptions {
  projectId: string;
  isOpen: boolean;
  isOriginalReadingMode: boolean;
  chapters: ChapterListItem[];
  textBlockTypes?: TextBlockType[];
  onRefresh?: () => void | Promise<void>;
  /** Pre-fill find query (e.g. from `/projects/:id?search=`). */
  initialQuery?: string;
  /** Called when debounced query changes (parent may sync URL). */
  onDebouncedQueryChange?: (query: string) => void;
}

export function useProjectSearch({
  projectId,
  isOpen,
  isOriginalReadingMode,
  chapters,
  textBlockTypes = [],
  onRefresh,
  initialQuery = '',
  onDebouncedQueryChange,
}: UseProjectSearchOptions) {
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [debouncedChapterFrom, setDebouncedChapterFrom] = useState('');
  const [debouncedChapterTo, setDebouncedChapterTo] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [chapterFrom, setChapterFrom] = useState('');
  const [chapterTo, setChapterTo] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [textBlockType, setTextBlockType] = useState('');

  const [rawMatches, setRawMatches] = useState<ProjectSearchMatch[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [selectionTouched, setSelectionTouched] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [previewSource, setPreviewSource] = useState<'literal' | 'ai'>('literal');
  const [aiPreviewItems, setAiPreviewItems] = useState<ReplacePreviewItem[]>([]);
  const [aiSelectedCount, setAiSelectedCount] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [replaceResult, setReplaceResult] = useState<{
    succeeded: number;
    failed: number;
    failedIds: string[];
  } | null>(null);
  const [pendingRetryUpdates, setPendingRetryUpdates] = useState<
    Array<{ chapterId: string; paragraphId: string; translatedText: string }>
  >([]);

  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened && initialQuery.trim()) {
      setQuery(initialQuery.trim());
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    onDebouncedQueryChange?.(debouncedQuery);
  }, [isOpen, debouncedQuery, onDebouncedQueryChange]);

  const debouncedParsedChapterFrom = parseChapterBound(debouncedChapterFrom);
  const debouncedParsedChapterTo = parseChapterBound(debouncedChapterTo);

  const performSearch = useCallback(
    async (
      searchQuery: string,
      chapterFromNum: number | undefined,
      chapterToNum: number | undefined,
      options: {
        append?: boolean;
        offset?: number;
        resetSelection?: boolean;
        caseSensitive?: boolean;
        wholeWord?: boolean;
      } = {}
    ) => {
      const {
        append = false,
        offset = 0,
        resetSelection = false,
        caseSensitive: cs = caseSensitive,
        wholeWord: ww = wholeWord,
      } = options;

      if (!searchQuery) {
        abortRef.current?.abort();
        abortRef.current = null;
        setRawMatches([]);
        setHasMore(false);
        setNextOffset(undefined);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestGenRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const field = isOriginalReadingMode ? 'original' : 'translated';

      try {
        const result = await api.searchProject(projectId, searchQuery, {
          field,
          caseSensitive: cs,
          wholeWord: ww,
          chapterFrom: chapterFromNum,
          chapterTo: chapterToNum,
          offset: append ? offset : 0,
          signal: controller.signal,
        });

        if (requestId !== requestGenRef.current) return;

        setRawMatches((prev) => (append ? [...prev, ...result.matches] : result.matches));
        setHasMore(result.hasMore);
        setNextOffset(result.nextOffset);

        if (!append && resetSelection) {
          const keys = new Set(
            dedupeParagraphMatches(result.matches).map((m) =>
              paragraphMatchKey(m.chapterId, m.paragraphId)
            )
          );
          setSelectedKeys(keys);
          setExcludedKeys(new Set());
          setSelectionTouched(false);
        }
      } catch (err) {
        if (isAbortError(err) || requestId !== requestGenRef.current) return;
        setError(err instanceof Error ? err.message : 'Search failed');
        if (!append) setRawMatches([]);
      } finally {
        if (requestId === requestGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [projectId, isOriginalReadingMode, caseSensitive, wholeWord]
  );

  const performSearchRef = useRef(performSearch);
  performSearchRef.current = performSearch;

  // Debounced search for query + chapter range
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const q = query.trim();
      const cf = chapterFrom.trim();
      const ct = chapterTo.trim();
      setDebouncedQuery(q);
      setDebouncedChapterFrom(cf);
      setDebouncedChapterTo(ct);
      void performSearchRef.current(q, parseChapterBound(cf), parseChapterBound(ct), {
        resetSelection: true,
      });
    }, PROJECT_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOpen, query, chapterFrom, chapterTo]);

  const searchOptionsRef = useRef({
    caseSensitive,
    wholeWord,
    isOriginalReadingMode,
  });

  // Immediate re-search when toggle options change (uses debounced query/range)
  useEffect(() => {
    if (!isOpen || !debouncedQuery) return;
    const prev = searchOptionsRef.current;
    if (
      prev.caseSensitive === caseSensitive &&
      prev.wholeWord === wholeWord &&
      prev.isOriginalReadingMode === isOriginalReadingMode
    ) {
      return;
    }
    searchOptionsRef.current = { caseSensitive, wholeWord, isOriginalReadingMode };
    void performSearchRef.current(
      debouncedQuery,
      debouncedParsedChapterFrom,
      debouncedParsedChapterTo,
      { resetSelection: false }
    );
  }, [
    caseSensitive,
    wholeWord,
    isOriginalReadingMode,
    isOpen,
    debouncedQuery,
    debouncedParsedChapterFrom,
    debouncedParsedChapterTo,
  ]);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [isOpen]);

  const isSearchPending =
    query.trim() !== debouncedQuery ||
    chapterFrom.trim() !== debouncedChapterFrom ||
    chapterTo.trim() !== debouncedChapterTo;

  const initialLoading = loading && rawMatches.length === 0;
  const refreshing = (loading || isSearchPending) && rawMatches.length > 0;

  const dedupedMatches = useMemo(() => dedupeParagraphMatches(rawMatches), [rawMatches]);

  const filteredMatches = useMemo(() => {
    return filterProjectMatches(dedupedMatches, {
      chapterFrom: debouncedParsedChapterFrom,
      chapterTo: debouncedParsedChapterTo,
      filterQuery: filterQuery.trim() || undefined,
      textBlockType: textBlockType || undefined,
    });
  }, [
    dedupedMatches,
    debouncedParsedChapterFrom,
    debouncedParsedChapterTo,
    filterQuery,
    textBlockType,
  ]);

  const visibleKeys = useMemo(
    () =>
      filteredMatches
        .map((m) => paragraphMatchKey(m.chapterId, m.paragraphId))
        .filter((k) => !excludedKeys.has(k)),
    [filteredMatches, excludedKeys]
  );

  const selectedVisibleCount = useMemo(
    () => visibleKeys.filter((k) => selectedKeys.has(k)).length,
    [visibleKeys, selectedKeys]
  );

  const translatedMatches = useMemo(
    () => filteredMatches.filter((m) => m.field === 'translated'),
    [filteredMatches]
  );

  const getSelectedMatches = useCallback(
    (allNonExcluded: boolean) => {
      return translatedMatches.filter((m) => {
        const key = paragraphMatchKey(m.chapterId, m.paragraphId);
        if (excludedKeys.has(key)) return false;
        if (allNonExcluded) return true;
        return selectedKeys.has(key);
      });
    },
    [translatedMatches, excludedKeys, selectedKeys]
  );

  const buildPreviewItems = useCallback(
    (matches: ProjectSearchMatch[]): ReplacePreviewItem[] => {
      if (!debouncedQuery || !replace.trim() || replace.trim() === debouncedQuery) return [];
      const items: ReplacePreviewItem[] = [];
      for (const m of matches) {
        const after = replaceInText(m.fullText, debouncedQuery, replace, true, caseSensitive);
        if (after !== m.fullText) {
          items.push({
            paragraphId: m.paragraphId,
            paragraphIndex: m.paragraphIndex,
            chapterId: m.chapterId,
            chapterNumber: m.chapterNumber,
            before: m.fullText,
            after,
            find: debouncedQuery,
            caseSensitive,
          });
        }
      }
      return items;
    },
    [debouncedQuery, replace, caseSensitive]
  );

  const previewItems = useMemo(
    () => buildPreviewItems(getSelectedMatches(false)),
    [buildPreviewItems, getSelectedMatches]
  );

  const activePreviewItems = previewSource === 'ai' ? aiPreviewItems : previewItems;

  const openLiteralPreview = useCallback(() => {
    setPreviewSource('literal');
    setAiPreviewItems([]);
    setShowPreview(true);
  }, []);

  const openAiPreview = useCallback((items: ReplacePreviewItem[], selectedCount: number) => {
    setPreviewSource('ai');
    setAiPreviewItems(items);
    setAiSelectedCount(selectedCount);
    setShowPreview(true);
  }, []);

  const closePreview = useCallback(() => {
    setShowPreview(false);
    setAiPreviewItems([]);
    setAiSelectedCount(0);
    setPreviewSource('literal');
  }, []);

  const canAiReplace =
    !isOriginalReadingMode &&
    !!debouncedQuery &&
    selectedVisibleCount > 0 &&
    getSelectedMatches(false).length > 0 &&
    !isSearchPending &&
    !loading;

  const canReplace =
    !isOriginalReadingMode &&
    !!debouncedQuery &&
    replace.trim() !== debouncedQuery &&
    translatedMatches.length > 0 &&
    !isSearchPending &&
    !loading;

  const runSearch = useCallback(
    (append = false, offset = 0, resetSelection = false) => {
      void performSearch(debouncedQuery, debouncedParsedChapterFrom, debouncedParsedChapterTo, {
        append,
        offset,
        resetSelection,
      });
    },
    [performSearch, debouncedQuery, debouncedParsedChapterFrom, debouncedParsedChapterTo]
  );

  const applyReplace = useCallback(
    async (items: ReplacePreviewItem[]) => {
      if (items.length === 0) return;
      setReplacing(true);
      setReplaceProgress({ done: 0, total: items.length });
      setReplaceResult(null);

      const updates = items.map((item) => ({
        chapterId: item.chapterId!,
        paragraphId: item.paragraphId,
        translatedText: item.after,
      }));

      try {
        const result = await bulkReplaceParagraphsChunked(projectId, updates, setReplaceProgress);
        const failedIds = result.failed.map((f) => f.paragraphId);
        setReplaceResult({
          succeeded: result.succeeded.length,
          failed: result.failed.length,
          failedIds,
        });
        setPendingRetryUpdates(updates.filter((u) => failedIds.includes(u.paragraphId)));

        if (result.succeeded.length > 0) {
          closePreview();
          await onRefresh?.();
          await performSearch(
            debouncedQuery,
            debouncedParsedChapterFrom,
            debouncedParsedChapterTo,
            { resetSelection: false }
          );
          if (result.failed.length === 0) {
            setReplace('');
          }
        }
      } catch {
        setReplaceResult({ succeeded: 0, failed: items.length, failedIds: [] });
      } finally {
        setReplacing(false);
        setReplaceProgress(null);
      }
    },
    [
      projectId,
      onRefresh,
      performSearch,
      debouncedQuery,
      debouncedParsedChapterFrom,
      debouncedParsedChapterTo,
      closePreview,
    ]
  );

  const retryFailed = useCallback(async () => {
    if (pendingRetryUpdates.length === 0) return;
    const retryItems: ReplacePreviewItem[] = pendingRetryUpdates.map((u) => {
      const m = translatedMatches.find((x) => x.paragraphId === u.paragraphId);
      return {
        paragraphId: u.paragraphId,
        paragraphIndex: m?.paragraphIndex ?? 0,
        chapterId: u.chapterId,
        chapterNumber: m?.chapterNumber ?? 0,
        before: m?.fullText ?? '',
        after: u.translatedText,
        find: debouncedQuery,
        caseSensitive,
      };
    });
    await applyReplace(retryItems);
  }, [pendingRetryUpdates, translatedMatches, debouncedQuery, caseSensitive, applyReplace]);

  const toggleSelected = useCallback((key: string) => {
    setSelectionTouched(true);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectionTouched(true);
    setSelectedKeys(new Set(visibleKeys));
  }, [visibleKeys]);

  const deselectAllVisible = useCallback(() => {
    setSelectionTouched(true);
    setSelectedKeys(new Set());
  }, []);

  const excludeKey = useCallback((key: string) => {
    setSelectionTouched(true);
    setExcludedKeys((prev) => new Set(prev).add(key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const includeKey = useCallback((key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const isDirty =
    !!query.trim() ||
    !!replace.trim() ||
    excludedKeys.size > 0 ||
    selectionTouched ||
    !!filterQuery.trim() ||
    !!chapterFrom.trim() ||
    !!chapterTo.trim() ||
    !!textBlockType ||
    caseSensitive ||
    wholeWord;

  const loadMore = useCallback(() => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    void performSearch(debouncedQuery, debouncedParsedChapterFrom, debouncedParsedChapterTo, {
      append: true,
      offset: nextOffset,
      resetSelection: false,
    });
  }, [
    hasMore,
    nextOffset,
    loadingMore,
    performSearch,
    debouncedQuery,
    debouncedParsedChapterFrom,
    debouncedParsedChapterTo,
  ]);

  const showLargeProjectHint = chapters.length > 200;

  return {
    query,
    setQuery,
    replace,
    setReplace,
    debouncedQuery,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    chapterFrom,
    setChapterFrom,
    chapterTo,
    setChapterTo,
    filterQuery,
    setFilterQuery,
    textBlockType,
    setTextBlockType,
    textBlockTypes,
    chapters,
    rawMatches,
    filteredMatches,
    dedupedMatches,
    loading,
    loadingMore,
    initialLoading,
    refreshing,
    isSearchPending,
    error,
    hasMore,
    runSearch,
    loadMore,
    selectedKeys,
    excludedKeys,
    toggleSelected,
    selectAllVisible,
    deselectAllVisible,
    excludeKey,
    includeKey,
    visibleKeys,
    selectedVisibleCount,
    showPreview,
    setShowPreview,
    replacing,
    replaceProgress,
    replaceResult,
    previewItems,
    previewSource,
    activePreviewItems,
    openLiteralPreview,
    openAiPreview,
    aiSelectedCount,
    closePreview,
    canAiReplace,
    getSelectedMatches,
    canReplace,
    applyReplace,
    retryFailed,
    pendingRetryUpdates,
    isDirty,
    isOriginalReadingMode,
    showLargeProjectHint,
  };
}
