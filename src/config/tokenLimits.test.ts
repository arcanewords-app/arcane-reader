import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  estimateChapterTranslationTokens,
  estimateProjectBatchTranslationTokens,
  estimateProjectChapterTranslationTokens,
  estimateTokensByStage,
  estimateTokensForChapterTitles,
  estimateTokensForStages,
  estimateTokensForTranslation,
  getTokenLimitForRole,
  isUnlimitedTokenLimit,
  TOKEN_LIMITS,
} from './tokenLimits.js';

describe('tokenLimits', () => {
  it('getTokenLimitForRole and isUnlimitedTokenLimit cover role matrix', () => {
    assert.equal(getTokenLimitForRole('guest'), 0);
    assert.equal(getTokenLimitForRole('author'), TOKEN_LIMITS.DAILY_LIMIT);
    assert.equal(getTokenLimitForRole('admin'), TOKEN_LIMITS.UNLIMITED_LIMIT);
    assert.equal(isUnlimitedTokenLimit(TOKEN_LIMITS.UNLIMITED_LIMIT), true);
    assert.equal(isUnlimitedTokenLimit(-5), true);
    assert.equal(isUnlimitedTokenLimit(100), false);
  });

  it('estimateTokensForStages sums selected stages', () => {
    const all = estimateTokensForStages(10000, 'all');
    const subset = estimateTokensForStages(10000, ['analysis', 'translation']);
    assert.equal(all, TOKEN_LIMITS.TOKENS_PER_10K_CHARS.total);
    assert.equal(
      subset,
      TOKEN_LIMITS.TOKENS_PER_10K_CHARS.analysis + TOKEN_LIMITS.TOKENS_PER_10K_CHARS.translation
    );
    assert.equal(estimateTokensForStages(0, ['editing']), 0);
  });

  it('estimateTokensForChapterTitles batches by TITLE_BATCH_SIZE', () => {
    assert.equal(estimateTokensForChapterTitles(0), 0);
    assert.equal(estimateTokensForChapterTitles(1), TOKEN_LIMITS.TOKENS_PER_TITLE_BATCH);
    assert.equal(
      estimateTokensForChapterTitles(TOKEN_LIMITS.TITLE_BATCH_SIZE + 1),
      TOKEN_LIMITS.TOKENS_PER_TITLE_BATCH * 2
    );
  });

  it('estimateTokensForTranslation respects skip flags', () => {
    const full = estimateTokensForTranslation(10000);
    const noAnalysis = estimateTokensForTranslation(10000, { skipAnalysis: true });
    const noEditing = estimateTokensForTranslation(10000, { skipEditing: true });
    assert.ok(full > noAnalysis);
    assert.ok(full > noEditing);
  });

  it('estimateTokensByStage omits skipped stages', () => {
    const full = estimateTokensByStage(10000);
    assert.ok(full.analysis != null);
    assert.ok(full.editing != null);
    assert.equal(full.total, (full.analysis ?? 0) + full.translation + (full.editing ?? 0));

    const partial = estimateTokensByStage(10000, { skipAnalysis: true, skipEditing: true });
    assert.equal(partial.analysis, undefined);
    assert.equal(partial.editing, undefined);
    assert.equal(partial.total, partial.translation);
  });

  it('project estimate helpers delegate to shared estimators', () => {
    const project = {
      glossary: [{ type: 'term' as const, original: 'Mana', mentionedInChapters: [1] }],
      settings: {},
      targetLanguage: 'ru',
    };
    const one = estimateProjectChapterTranslationTokens(project, 1, {
      textLength: 5000,
      stages: ['translation'],
      translateChapterTitles: true,
    });
    const batch = estimateProjectBatchTranslationTokens(
      project,
      [{ textLength: 5000, chapterNumber: 1 }],
      { stages: ['translation'], translateChapterTitles: true }
    );
    assert.ok(one > 0);
    assert.ok(batch > 0);
    assert.ok(estimateChapterTranslationTokens({ textLength: 1000, stages: 'all' }) > 0);
  });
});
