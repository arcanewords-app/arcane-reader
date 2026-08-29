import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { CHAPTER_COLUMNS, chapterSelect, asChapterRows } from './chapterColumns.js';

describe('chapterSelect', () => {
  it('defaults to recovery (chunks, no original_text or critic_report)', () => {
    assert.equal(chapterSelect(), CHAPTER_COLUMNS.recovery);
    assert.ok(!CHAPTER_COLUMNS.recovery.includes('original_text'));
    assert.ok(!CHAPTER_COLUMNS.recovery.includes('critic_report'));
    assert.ok(CHAPTER_COLUMNS.recovery.includes('translated_chunks'));
  });

  it('core omits TOAST recovery and critic columns', () => {
    assert.equal(chapterSelect('core'), CHAPTER_COLUMNS.core);
    assert.ok(!CHAPTER_COLUMNS.core.includes('translated_chunks'));
    assert.ok(!CHAPTER_COLUMNS.core.includes('original_text'));
    assert.ok(!CHAPTER_COLUMNS.core.includes('critic_report'));
    assert.ok(CHAPTER_COLUMNS.core.includes('translated_text'));
  });

  it('full is star select', () => {
    assert.equal(chapterSelect('full'), '*');
  });

  it('asChapterRows returns empty for non-arrays', () => {
    assert.deepEqual(asChapterRows(null), []);
    assert.deepEqual(asChapterRows({ id: 'x' }), []);
    assert.deepEqual(asChapterRows([{ id: 'c1' }]), [{ id: 'c1' }]);
  });
});
