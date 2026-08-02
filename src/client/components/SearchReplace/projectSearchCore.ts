/**
 * Pure helpers for project-wide search & replace UI.
 * Kept separate from the Preact hook for unit coverage.
 */

import type { ProjectSearchMatch } from '../../types';
import { paragraphMatchKey, replaceInText } from '../../utils/search-utils';
import type { ReplacePreviewItem } from './ReplacePreviewModal';

export const PROJECT_SEARCH_DEBOUNCE_MS = 600;
export const LARGE_PROJECT_CHAPTER_HINT = 200;

export function parseChapterBound(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function searchErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Search failed';
}

export function computeIsSearchPending(input: {
  query: string;
  debouncedQuery: string;
  chapterFrom: string;
  debouncedChapterFrom: string;
  chapterTo: string;
  debouncedChapterTo: string;
}): boolean {
  return (
    input.query.trim() !== input.debouncedQuery ||
    input.chapterFrom.trim() !== input.debouncedChapterFrom ||
    input.chapterTo.trim() !== input.debouncedChapterTo
  );
}

export function computeLoadingFlags(input: {
  loading: boolean;
  isSearchPending: boolean;
  matchCount: number;
}): { initialLoading: boolean; refreshing: boolean } {
  return {
    initialLoading: input.loading && input.matchCount === 0,
    refreshing: (input.loading || input.isSearchPending) && input.matchCount > 0,
  };
}

export function mergeSearchMatches(
  prev: ProjectSearchMatch[],
  next: ProjectSearchMatch[],
  append: boolean
): ProjectSearchMatch[] {
  return append ? [...prev, ...next] : next;
}

export function selectionKeysFromMatches(matches: ProjectSearchMatch[]): Set<string> {
  return new Set(matches.map((m) => paragraphMatchKey(m.chapterId, m.paragraphId)));
}

export function visibleMatchKeys(
  matches: ProjectSearchMatch[],
  excludedKeys: ReadonlySet<string>
): string[] {
  return matches
    .map((m) => paragraphMatchKey(m.chapterId, m.paragraphId))
    .filter((k) => !excludedKeys.has(k));
}

export function countSelectedVisible(
  visibleKeys: readonly string[],
  selectedKeys: ReadonlySet<string>
): number {
  return visibleKeys.filter((k) => selectedKeys.has(k)).length;
}

export function filterSelectedMatches(
  matches: ProjectSearchMatch[],
  options: {
    excludedKeys: ReadonlySet<string>;
    selectedKeys: ReadonlySet<string>;
    allNonExcluded: boolean;
  }
): ProjectSearchMatch[] {
  return matches.filter((m) => {
    const key = paragraphMatchKey(m.chapterId, m.paragraphId);
    if (options.excludedKeys.has(key)) return false;
    if (options.allNonExcluded) return true;
    return options.selectedKeys.has(key);
  });
}

export function translatedMatchesOnly(matches: ProjectSearchMatch[]): ProjectSearchMatch[] {
  return matches.filter((m) => m.field === 'translated');
}

export function buildLiteralPreviewItems(
  matches: ProjectSearchMatch[],
  options: {
    find: string;
    replace: string;
    caseSensitive: boolean;
  }
): ReplacePreviewItem[] {
  const find = options.find;
  const replace = options.replace.trim();
  if (!find || !replace || replace === find) return [];

  const items: ReplacePreviewItem[] = [];
  for (const m of matches) {
    const after = replaceInText(m.fullText, find, options.replace, true, options.caseSensitive);
    if (after !== m.fullText) {
      items.push({
        paragraphId: m.paragraphId,
        paragraphIndex: m.paragraphIndex,
        chapterId: m.chapterId,
        chapterNumber: m.chapterNumber,
        before: m.fullText,
        after,
        find,
        caseSensitive: options.caseSensitive,
      });
    }
  }
  return items;
}

export function computeCanAiReplace(input: {
  isOriginalReadingMode: boolean;
  debouncedQuery: string;
  selectedVisibleCount: number;
  selectedMatchCount: number;
  isSearchPending: boolean;
  loading: boolean;
}): boolean {
  return (
    !input.isOriginalReadingMode &&
    !!input.debouncedQuery &&
    input.selectedVisibleCount > 0 &&
    input.selectedMatchCount > 0 &&
    !input.isSearchPending &&
    !input.loading
  );
}

export function computeCanReplace(input: {
  isOriginalReadingMode: boolean;
  debouncedQuery: string;
  replace: string;
  translatedMatchCount: number;
  isSearchPending: boolean;
  loading: boolean;
}): boolean {
  return (
    !input.isOriginalReadingMode &&
    !!input.debouncedQuery &&
    input.replace.trim() !== input.debouncedQuery &&
    input.translatedMatchCount > 0 &&
    !input.isSearchPending &&
    !input.loading
  );
}

export function computeIsDirty(input: {
  query: string;
  replace: string;
  excludedCount: number;
  selectionTouched: boolean;
  filterQuery: string;
  chapterFrom: string;
  chapterTo: string;
  textBlockType: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}): boolean {
  return (
    !!input.query.trim() ||
    !!input.replace.trim() ||
    input.excludedCount > 0 ||
    input.selectionTouched ||
    !!input.filterQuery.trim() ||
    !!input.chapterFrom.trim() ||
    !!input.chapterTo.trim() ||
    !!input.textBlockType ||
    input.caseSensitive ||
    input.wholeWord
  );
}

export function showLargeProjectHint(chapterCount: number): boolean {
  return chapterCount > LARGE_PROJECT_CHAPTER_HINT;
}

export function toggleKeyInSet(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function excludeKeyFromSelection(
  selectedKeys: ReadonlySet<string>,
  excludedKeys: ReadonlySet<string>,
  key: string
): { selectedKeys: Set<string>; excludedKeys: Set<string> } {
  const nextSelected = new Set(selectedKeys);
  nextSelected.delete(key);
  const nextExcluded = new Set(excludedKeys);
  nextExcluded.add(key);
  return { selectedKeys: nextSelected, excludedKeys: nextExcluded };
}

export function includeKeyInExcluded(excludedKeys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(excludedKeys);
  next.delete(key);
  return next;
}

export function shouldLoadMore(input: {
  hasMore: boolean;
  nextOffset: number | undefined | null;
  loadingMore: boolean;
}): boolean {
  return input.hasMore && input.nextOffset != null && !input.loadingMore;
}

export function buildRetryPreviewItems(
  pendingUpdates: Array<{ chapterId: string; paragraphId: string; translatedText: string }>,
  translatedMatches: ProjectSearchMatch[],
  options: { find: string; caseSensitive: boolean }
): ReplacePreviewItem[] {
  return pendingUpdates.map((u) => {
    const m = translatedMatches.find((x) => x.paragraphId === u.paragraphId);
    return {
      paragraphId: u.paragraphId,
      paragraphIndex: m?.paragraphIndex ?? 0,
      chapterId: u.chapterId,
      chapterNumber: m?.chapterNumber ?? 0,
      before: m?.fullText ?? '',
      after: u.translatedText,
      find: options.find,
      caseSensitive: options.caseSensitive,
    };
  });
}

export function searchOptionsChanged(
  prev: { caseSensitive: boolean; wholeWord: boolean; isOriginalReadingMode: boolean },
  next: { caseSensitive: boolean; wholeWord: boolean; isOriginalReadingMode: boolean }
): boolean {
  return (
    prev.caseSensitive !== next.caseSensitive ||
    prev.wholeWord !== next.wholeWord ||
    prev.isOriginalReadingMode !== next.isOriginalReadingMode
  );
}
