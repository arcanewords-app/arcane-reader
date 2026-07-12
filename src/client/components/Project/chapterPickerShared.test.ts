import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  computeChapterPickerStats,
  filterChaptersByStatus,
  getChapterIdsForPreset,
} from './chapterPickerShared.js';

const chapters = [
  { id: 'c1', number: 1, title: 'One', status: 'completed' },
  { id: 'c2', number: 2, title: 'Two', status: 'error' },
  { id: 'c3', number: 3, title: 'Three', status: 'pending' },
];

describe('chapterPickerShared', () => {
  it('filterChaptersByStatus filters error chapters', () => {
    const filtered = filterChaptersByStatus(chapters, 'error');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'c2');
  });

  it('computeChapterPickerStats aggregates counts', () => {
    const stats = computeChapterPickerStats(chapters);
    assert.equal(stats.chapters, 3);
    assert.equal(stats.translated, 1);
    assert.equal(stats.error, 1);
    assert.equal(stats.empty, 2);
  });

  it('getChapterIdsForPreset returns ids for preset filter', () => {
    assert.deepEqual(getChapterIdsForPreset(chapters, 'error'), ['c2']);
    assert.deepEqual(getChapterIdsForPreset(chapters, 'all'), []);
  });
});
