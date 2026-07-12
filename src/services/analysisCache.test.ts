import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('./redisCache.js', () => ({
  buildRedisKey: (...parts: string[]) => parts.join(':'),
  redisGetJson: vi.fn(),
  redisSetJson: vi.fn(),
  redisDelByPattern: vi.fn().mockResolvedValue(3),
}));

import { redisDelByPattern, redisGetJson, redisSetJson } from './redisCache.js';
import {
  analysisResultCacheKey,
  getCachedAnalysisResult,
  invalidateAnalysisForChapter,
  invalidateAnalysisForProject,
  setCachedAnalysisResult,
} from './analysisCache.js';

describe('analysisCache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('analysisResultCacheKey includes project, chapter, and language pair', () => {
    const key = analysisResultCacheKey('p1', 'ch1', {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.match(key, /p1/);
    assert.match(key, /ch1/);
    assert.match(key, /en/);
    assert.match(key, /ru/);
  });

  it('getCachedAnalysisResult reads from redis', async () => {
    vi.mocked(redisGetJson).mockResolvedValue({ chapterNumber: 1, data: {}, tokensUsed: 0 });
    const cached = await getCachedAnalysisResult('p1', 'ch1', {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.equal(cached?.chapterNumber, 1);
  });

  it('setCachedAnalysisResult writes to redis', async () => {
    await setCachedAnalysisResult(
      'p1',
      'ch1',
      { sourceLanguage: 'en', targetLanguage: 'ru' },
      { chapterNumber: 1, data: {} as never, tokensUsed: 5 }
    );
    assert.equal(vi.mocked(redisSetJson).mock.calls.length, 1);
  });

  it('invalidateAnalysisForChapter deletes chapter pattern', async () => {
    const count = await invalidateAnalysisForChapter('p1', 'ch1');
    assert.equal(count, 3);
    assert.equal(vi.mocked(redisDelByPattern).mock.calls.length, 1);
  });

  it('invalidateAnalysisForProject deletes project pattern', async () => {
    await invalidateAnalysisForProject('p1');
    assert.match(String(vi.mocked(redisDelByPattern).mock.calls[0]?.[0]), /p1/);
  });
});
