import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../types.js';
import type { SearchMatch } from '../../utils/search-utils.js';
import {
  buildReplacePreviewItems,
  buildSearchHighlight,
  canReplaceInChapter,
  clampMatchIndex,
  nextMatchIndex,
  prevMatchIndex,
  searchFieldForMode,
  trimFindQuery,
} from './chapterSearchReplaceCore.js';

const paragraphs: Paragraph[] = [
  {
    id: 'p1',
    index: 0,
    originalText: 'hello world',
    translatedText: 'привет мир',
    status: 'translated',
  },
  {
    id: 'p2',
    index: 1,
    originalText: 'hello again',
    translatedText: 'привет снова',
    status: 'translated',
  },
];

const matches: SearchMatch[] = [
  {
    paragraphId: 'p1',
    paragraphIndex: 0,
    field: 'translated',
    snippet: 'привет мир',
    snippetHtml: '<mark>привет</mark> мир',
    fullText: 'привет мир',
  },
  {
    paragraphId: 'p2',
    paragraphIndex: 1,
    field: 'translated',
    snippet: 'привет снова',
    snippetHtml: '<mark>привет</mark> снова',
    fullText: 'привет снова',
  },
];

describe('chapterSearchReplaceCore', () => {
  it('trimFindQuery trims and caps length', () => {
    expect(trimFindQuery('  ab  ')).toBe('ab');
    expect(trimFindQuery('x'.repeat(3000)).length).toBe(2000);
  });

  it('match index helpers wrap and clamp', () => {
    expect(nextMatchIndex(0, 3)).toBe(1);
    expect(nextMatchIndex(2, 3)).toBe(0);
    expect(prevMatchIndex(0, 3)).toBe(2);
    expect(prevMatchIndex(1, 3)).toBe(0);
    expect(clampMatchIndex(5, 3)).toBe(2);
    expect(clampMatchIndex(-1, 3)).toBe(0);
    expect(clampMatchIndex(0, 0)).toBe(0);
  });

  it('buildSearchHighlight collects unique ids', () => {
    expect(buildSearchHighlight([], 0)).toEqual({
      paragraphIds: [],
      currentParagraphId: null,
    });
    expect(buildSearchHighlight(matches, 1)).toEqual({
      paragraphIds: ['p1', 'p2'],
      currentParagraphId: 'p2',
    });
  });

  it('canReplaceInChapter gates replace mode', () => {
    expect(
      canReplaceInChapter({
        hasOnReplace: true,
        isOriginalReadingMode: false,
        debouncedFind: 'a',
        replace: 'b',
        hasMatches: true,
      })
    ).toBe(true);
    expect(
      canReplaceInChapter({
        hasOnReplace: true,
        isOriginalReadingMode: true,
        debouncedFind: 'a',
        replace: 'b',
        hasMatches: true,
      })
    ).toBe(false);
    expect(
      canReplaceInChapter({
        hasOnReplace: true,
        isOriginalReadingMode: false,
        debouncedFind: 'a',
        replace: ' a ',
        hasMatches: true,
      })
    ).toBe(false);
  });

  it('searchFieldForMode and buildReplacePreviewItems', () => {
    expect(searchFieldForMode(true)).toBe('original');
    expect(searchFieldForMode(false)).toBe('translated');

    const items = buildReplacePreviewItems({
      paragraphs,
      matches,
      debouncedFind: 'привет',
      replace: 'хай',
      caseSensitive: false,
      hasMatches: true,
    });
    expect(items).toHaveLength(2);
    expect(items[0].before).toContain('привет');
    expect(items[0].after).toContain('хай');

    expect(
      buildReplacePreviewItems({
        paragraphs,
        matches,
        debouncedFind: '',
        replace: 'x',
        caseSensitive: false,
        hasMatches: true,
      })
    ).toEqual([]);
  });
});
