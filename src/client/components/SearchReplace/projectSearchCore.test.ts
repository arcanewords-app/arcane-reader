import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { ProjectSearchMatch } from '../../types';
import {
  LARGE_PROJECT_CHAPTER_HINT,
  PROJECT_SEARCH_DEBOUNCE_MS,
  buildLiteralPreviewItems,
  buildRetryPreviewItems,
  computeCanAiReplace,
  computeCanReplace,
  computeIsDirty,
  computeIsSearchPending,
  computeLoadingFlags,
  countSelectedVisible,
  excludeKeyFromSelection,
  filterSelectedMatches,
  includeKeyInExcluded,
  isAbortError,
  mergeSearchMatches,
  parseChapterBound,
  searchErrorMessage,
  searchOptionsChanged,
  selectionKeysFromMatches,
  shouldLoadMore,
  showLargeProjectHint,
  toggleKeyInSet,
  translatedMatchesOnly,
  visibleMatchKeys,
} from './projectSearchCore.js';

function match(overrides: Partial<ProjectSearchMatch> = {}): ProjectSearchMatch {
  return {
    chapterId: 'ch-1',
    chapterNumber: 1,
    chapterTitle: 'Chapter 1',
    paragraphId: 'p-1',
    paragraphIndex: 0,
    field: 'translated',
    snippet: 'hello world',
    fullText: 'hello world',
    ...overrides,
  };
}

describe('projectSearchCore', () => {
  it('exports debounce and large-project constants', () => {
    assert.equal(PROJECT_SEARCH_DEBOUNCE_MS, 600);
    assert.equal(LARGE_PROJECT_CHAPTER_HINT, 200);
  });

  describe('parseChapterBound', () => {
    it('parses positive finite chapter numbers', () => {
      assert.equal(parseChapterBound('3'), 3);
      assert.equal(parseChapterBound(' 12 '), 12);
    });

    it('returns undefined for empty or invalid values', () => {
      assert.equal(parseChapterBound(''), undefined);
      assert.equal(parseChapterBound('  '), undefined);
      assert.equal(parseChapterBound('0'), undefined);
      assert.equal(parseChapterBound('-1'), undefined);
      assert.equal(parseChapterBound('abc'), undefined);
    });
  });

  describe('isAbortError / searchErrorMessage', () => {
    it('detects AbortError DOMException', () => {
      assert.equal(isAbortError(new DOMException('aborted', 'AbortError')), true);
      assert.equal(isAbortError(new Error('fail')), false);
      assert.equal(isAbortError('x'), false);
    });

    it('formats search errors', () => {
      assert.equal(searchErrorMessage(new Error('boom')), 'boom');
      assert.equal(searchErrorMessage('x'), 'Search failed');
    });
  });

  describe('loading / pending flags', () => {
    it('computes search pending from trimmed fields', () => {
      assert.equal(
        computeIsSearchPending({
          query: ' a ',
          debouncedQuery: 'a',
          chapterFrom: '1',
          debouncedChapterFrom: '1',
          chapterTo: '',
          debouncedChapterTo: '',
        }),
        false
      );
      assert.equal(
        computeIsSearchPending({
          query: 'ab',
          debouncedQuery: 'a',
          chapterFrom: '',
          debouncedChapterFrom: '',
          chapterTo: '',
          debouncedChapterTo: '',
        }),
        true
      );
    });

    it('computes initialLoading and refreshing', () => {
      assert.deepEqual(
        computeLoadingFlags({ loading: true, isSearchPending: false, matchCount: 0 }),
        { initialLoading: true, refreshing: false }
      );
      assert.deepEqual(
        computeLoadingFlags({ loading: false, isSearchPending: true, matchCount: 2 }),
        { initialLoading: false, refreshing: true }
      );
    });
  });

  describe('match helpers', () => {
    it('merges matches for append/replace', () => {
      const a = [match({ paragraphId: 'p1' })];
      const b = [match({ paragraphId: 'p2' })];
      assert.deepEqual(mergeSearchMatches(a, b, false), b);
      assert.equal(mergeSearchMatches(a, b, true).length, 2);
    });

    it('builds selection and visible keys', () => {
      const matches = [
        match({ chapterId: 'c1', paragraphId: 'p1' }),
        match({ chapterId: 'c1', paragraphId: 'p2' }),
      ];
      const keys = selectionKeysFromMatches(matches);
      assert.equal(keys.size, 2);
      assert.deepEqual(visibleMatchKeys(matches, new Set(['c1-p1'])), ['c1-p2']);
      assert.equal(countSelectedVisible(['c1-p1', 'c1-p2'], new Set(['c1-p2'])), 1);
    });

    it('filters selected and translated matches', () => {
      const matches = [
        match({ paragraphId: 'p1', field: 'translated' }),
        match({ paragraphId: 'p2', field: 'original', chapterId: 'ch-1' }),
        match({ paragraphId: 'p3', field: 'translated' }),
      ];
      assert.equal(translatedMatchesOnly(matches).length, 2);
      const selected = filterSelectedMatches(matches, {
        excludedKeys: new Set(['ch-1-p3']),
        selectedKeys: new Set(['ch-1-p1']),
        allNonExcluded: false,
      });
      assert.deepEqual(
        selected.map((m) => m.paragraphId),
        ['p1']
      );
      assert.equal(
        filterSelectedMatches(translatedMatchesOnly(matches), {
          excludedKeys: new Set(['ch-1-p3']),
          selectedKeys: new Set(),
          allNonExcluded: true,
        }).length,
        1
      );
    });
  });

  describe('preview / replace gates', () => {
    it('builds literal preview items when replace changes text', () => {
      const items = buildLiteralPreviewItems([match({ fullText: 'hello world' })], {
        find: 'world',
        replace: 'earth',
        caseSensitive: false,
      });
      assert.equal(items.length, 1);
      assert.equal(items[0]!.after, 'hello earth');
    });

    it('skips preview when find/replace empty or identical', () => {
      assert.deepEqual(
        buildLiteralPreviewItems([match()], { find: '', replace: 'x', caseSensitive: false }),
        []
      );
      assert.deepEqual(
        buildLiteralPreviewItems([match()], {
          find: 'hello world',
          replace: 'hello world',
          caseSensitive: false,
        }),
        []
      );
    });

    it('gates AI and literal replace actions', () => {
      assert.equal(
        computeCanAiReplace({
          isOriginalReadingMode: false,
          debouncedQuery: 'q',
          selectedVisibleCount: 1,
          selectedMatchCount: 1,
          isSearchPending: false,
          loading: false,
        }),
        true
      );
      assert.equal(
        computeCanAiReplace({
          isOriginalReadingMode: true,
          debouncedQuery: 'q',
          selectedVisibleCount: 1,
          selectedMatchCount: 1,
          isSearchPending: false,
          loading: false,
        }),
        false
      );
      assert.equal(
        computeCanReplace({
          isOriginalReadingMode: false,
          debouncedQuery: 'old',
          replace: 'new',
          translatedMatchCount: 2,
          isSearchPending: false,
          loading: false,
        }),
        true
      );
      assert.equal(
        computeCanReplace({
          isOriginalReadingMode: false,
          debouncedQuery: 'same',
          replace: 'same',
          translatedMatchCount: 2,
          isSearchPending: false,
          loading: false,
        }),
        false
      );
    });

    it('builds retry preview items from pending updates', () => {
      const items = buildRetryPreviewItems(
        [{ chapterId: 'c1', paragraphId: 'p1', translatedText: 'after' }],
        [match({ paragraphId: 'p1', paragraphIndex: 3, chapterNumber: 7, fullText: 'before' })],
        { find: 'x', caseSensitive: true }
      );
      assert.equal(items[0]!.after, 'after');
      assert.equal(items[0]!.paragraphIndex, 3);
      assert.equal(items[0]!.chapterNumber, 7);
      assert.equal(items[0]!.caseSensitive, true);
    });
  });

  describe('dirty / selection / load-more', () => {
    it('computes dirty state from any active control', () => {
      assert.equal(
        computeIsDirty({
          query: '',
          replace: '',
          excludedCount: 0,
          selectionTouched: false,
          filterQuery: '',
          chapterFrom: '',
          chapterTo: '',
          textBlockType: '',
          caseSensitive: false,
          wholeWord: false,
        }),
        false
      );
      assert.equal(
        computeIsDirty({
          query: 'q',
          replace: '',
          excludedCount: 0,
          selectionTouched: false,
          filterQuery: '',
          chapterFrom: '',
          chapterTo: '',
          textBlockType: '',
          caseSensitive: false,
          wholeWord: false,
        }),
        true
      );
      assert.equal(
        computeIsDirty({
          query: '',
          replace: '',
          excludedCount: 0,
          selectionTouched: false,
          filterQuery: '',
          chapterFrom: '',
          chapterTo: '',
          textBlockType: '',
          caseSensitive: true,
          wholeWord: false,
        }),
        true
      );
    });

    it('toggles and excludes selection keys', () => {
      assert.deepEqual([...toggleKeyInSet(new Set(['a']), 'b')].sort(), ['a', 'b']);
      assert.deepEqual([...toggleKeyInSet(new Set(['a']), 'a')], []);
      const excluded = excludeKeyFromSelection(new Set(['a', 'b']), new Set(), 'a');
      assert.deepEqual([...excluded.selectedKeys], ['b']);
      assert.deepEqual([...excluded.excludedKeys], ['a']);
      assert.deepEqual([...includeKeyInExcluded(new Set(['a', 'b']), 'a')], ['b']);
    });

    it('gates load-more and large-project hint', () => {
      assert.equal(shouldLoadMore({ hasMore: true, nextOffset: 20, loadingMore: false }), true);
      assert.equal(shouldLoadMore({ hasMore: true, nextOffset: null, loadingMore: false }), false);
      assert.equal(shouldLoadMore({ hasMore: true, nextOffset: 20, loadingMore: true }), false);
      assert.equal(showLargeProjectHint(200), false);
      assert.equal(showLargeProjectHint(201), true);
    });

    it('detects search option changes', () => {
      const base = { caseSensitive: false, wholeWord: false, isOriginalReadingMode: false };
      assert.equal(searchOptionsChanged(base, base), false);
      assert.equal(searchOptionsChanged(base, { ...base, wholeWord: true }), true);
      assert.equal(searchOptionsChanged(base, { ...base, isOriginalReadingMode: true }), true);
    });
  });
});
