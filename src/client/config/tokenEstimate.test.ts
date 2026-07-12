import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  TOKENS_PER_10K_CHARS,
  TITLE_BATCH_SIZE,
  TOKENS_PER_TITLE_BATCH,
  estimateTokensForChapterTitles,
  estimateTokensForStages,
  estimateTokensForTranslation,
} from './tokenEstimate.js';

describe('estimateTokensForStages', () => {
  it('sums all stages when stages is all', () => {
    const total = estimateTokensForStages(10_000, 'all');
    const expected =
      TOKENS_PER_10K_CHARS.analysis +
      TOKENS_PER_10K_CHARS.translation +
      TOKENS_PER_10K_CHARS.editing;
    assert.equal(total, expected);
  });

  it('sums only selected stages from array', () => {
    const total = estimateTokensForStages(10_000, ['analysis', 'translation']);
    assert.equal(total, TOKENS_PER_10K_CHARS.analysis + TOKENS_PER_10K_CHARS.translation);
  });

  it('returns zero for empty stage selection', () => {
    assert.equal(estimateTokensForStages(10_000, []), 0);
  });

  it('ceilings fractional token estimates', () => {
    const total = estimateTokensForStages(1000, ['translation']);
    assert.equal(total, Math.ceil(TOKENS_PER_10K_CHARS.translation / 10));
  });
});

describe('estimateTokensForTranslation', () => {
  it('includes all stages by default', () => {
    const total = estimateTokensForTranslation(10_000);
    const expected =
      TOKENS_PER_10K_CHARS.analysis +
      TOKENS_PER_10K_CHARS.translation +
      TOKENS_PER_10K_CHARS.editing;
    assert.equal(total, expected);
  });

  it('skips analysis when skipAnalysis is true', () => {
    const total = estimateTokensForTranslation(10_000, { skipAnalysis: true });
    const expected = TOKENS_PER_10K_CHARS.translation + TOKENS_PER_10K_CHARS.editing;
    assert.equal(total, expected);
  });

  it('skips editing when skipEditing is true', () => {
    const total = estimateTokensForTranslation(10_000, { skipEditing: true });
    const expected = TOKENS_PER_10K_CHARS.analysis + TOKENS_PER_10K_CHARS.translation;
    assert.equal(total, expected);
  });
});

describe('estimateTokensForChapterTitles', () => {
  it('returns zero for non-positive chapter count', () => {
    assert.equal(estimateTokensForChapterTitles(0), 0);
    assert.equal(estimateTokensForChapterTitles(-1), 0);
  });

  it('charges one batch for small chapter counts', () => {
    assert.equal(estimateTokensForChapterTitles(1), TOKENS_PER_TITLE_BATCH);
    assert.equal(estimateTokensForChapterTitles(TITLE_BATCH_SIZE), TOKENS_PER_TITLE_BATCH);
  });

  it('charges multiple batches for large chapter counts', () => {
    const chapters = TITLE_BATCH_SIZE + 1;
    const batches = Math.ceil(chapters / TITLE_BATCH_SIZE);
    assert.equal(estimateTokensForChapterTitles(chapters), batches * TOKENS_PER_TITLE_BATCH);
  });
});
