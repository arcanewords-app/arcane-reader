import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  CHAPTER_PICKER_SEARCH_THRESHOLD,
  PAGE_SIZE_OPTIONS,
  computeChapterPickerStats,
  filterChaptersByStatus,
  getChapterHasTranslation,
  getChapterIdsForPreset,
  hasLastAnalysis,
  presetButtonStyle,
  toChapterPickerItem,
} from './chapterPickerShared.js';

const chapters = [
  { id: 'c1', number: 1, title: 'One', status: 'completed' },
  { id: 'c2', number: 2, title: 'Two', status: 'error' },
  { id: 'c3', number: 3, title: 'Three', status: 'pending' },
  {
    id: 'c4',
    number: 4,
    title: 'Four',
    status: 'partial',
    lastAnalysisAt: '2026-01-01T00:00:00Z',
  },
  { id: 'c5', number: 5, title: 'Five', status: 'draft' },
  { id: 'c6', number: 6, title: 'Six', status: 'analyzed' },
  {
    id: 'c7',
    number: 7,
    title: 'Seven',
    status: 'pending',
    translationMeta: { lastAnalysisAt: '2026-02-01T00:00:00Z' },
  },
];

describe('chapterPickerShared constants', () => {
  it('exports page size options and search threshold', () => {
    assert.deepEqual(PAGE_SIZE_OPTIONS, [10, 20, 50, 100]);
    assert.equal(CHAPTER_PICKER_SEARCH_THRESHOLD, 100);
  });
});

describe('presetButtonStyle', () => {
  it('uses semantic colors per filter', () => {
    assert.equal(presetButtonStyle('error').color, 'var(--error)');
    assert.equal(presetButtonStyle('partial').color, 'var(--warning)');
    assert.equal(presetButtonStyle('draft').color, 'var(--accent)');
    assert.equal(presetButtonStyle('analyzed').color, 'var(--accent)');
    assert.equal(presetButtonStyle('not_analyzed').color, 'var(--accent)');
    assert.equal(presetButtonStyle('all').color, 'var(--text-dim)');
  });
});

describe('hasLastAnalysis', () => {
  it('detects analysis from top-level or translationMeta', () => {
    assert.equal(hasLastAnalysis({ lastAnalysisAt: '2026-01-01' }), true);
    assert.equal(hasLastAnalysis({ translationMeta: { lastAnalysisAt: '2026-01-01' } }), true);
    assert.equal(hasLastAnalysis({}), false);
  });
});

describe('toChapterPickerItem / getChapterHasTranslation', () => {
  it('preserves explicit hasTranslation when boolean', () => {
    const item = toChapterPickerItem({
      id: 'x',
      number: 1,
      title: 'T',
      status: 'pending',
      hasTranslation: true,
    });
    assert.equal(item.hasTranslation, true);
  });

  it('derives hasTranslation from completed, draft, or partial status', () => {
    assert.equal(
      getChapterHasTranslation({ id: 'a', number: 1, title: 'A', status: 'completed' }),
      true
    );
    assert.equal(
      getChapterHasTranslation({ id: 'b', number: 2, title: 'B', status: 'draft' }),
      true
    );
    assert.equal(
      getChapterHasTranslation({ id: 'c', number: 3, title: 'C', status: 'partial' }),
      true
    );
    assert.equal(
      getChapterHasTranslation({ id: 'd', number: 4, title: 'D', status: 'pending' }),
      false
    );
    assert.equal(getChapterHasTranslation({ id: 'e', number: 5, title: 'E' }), false);
  });
});

describe('filterChaptersByStatus', () => {
  it('returns full list for all filter', () => {
    assert.equal(filterChaptersByStatus(chapters, 'all').length, chapters.length);
  });

  it('filters error chapters', () => {
    const filtered = filterChaptersByStatus(chapters, 'error');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'c2');
  });

  it('filters by translation and analysis presets', () => {
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'completed').map((c) => c.id),
      ['c1']
    );
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'partial').map((c) => c.id),
      ['c4']
    );
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'draft').map((c) => c.id),
      ['c5']
    );
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'analyzed').map((c) => c.id),
      ['c6']
    );
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'empty').map((c) => c.id),
      ['c2', 'c3', 'c6', 'c7']
    );
    assert.deepEqual(
      filterChaptersByStatus(chapters, 'not_analyzed').map((c) => c.id),
      ['c1', 'c2', 'c3', 'c5', 'c6']
    );
  });

  it('accepts custom hasLastAnalysis predicate for not_analyzed', () => {
    const alwaysAnalyzed = () => true;
    assert.deepEqual(filterChaptersByStatus(chapters, 'not_analyzed', alwaysAnalyzed), []);
  });
});

describe('computeChapterPickerStats', () => {
  it('aggregates counts across statuses', () => {
    const stats = computeChapterPickerStats(chapters);
    assert.equal(stats.chapters, 7);
    assert.equal(stats.translated, 1);
    assert.equal(stats.partial, 1);
    assert.equal(stats.draft, 1);
    assert.equal(stats.analyzed, 1);
    assert.equal(stats.error, 1);
    assert.equal(stats.empty, 4);
    assert.equal(stats.notAnalyzed, 5);
  });
});

describe('getChapterIdsForPreset', () => {
  it('returns ids for preset filter and empty for all', () => {
    assert.deepEqual(getChapterIdsForPreset(chapters, 'error'), ['c2']);
    assert.deepEqual(getChapterIdsForPreset(chapters, 'all'), []);
  });
});
