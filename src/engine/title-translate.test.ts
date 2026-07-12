import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { OpenAIProvider } from './providers/openai.js';
import { translateChapterTitlesBatch } from './title-translate.js';

function providerReturning(items: Array<{ chapterId: string; translatedTitle: string }>) {
  const provider = {
    completeJSON: vi.fn().mockResolvedValue({
      data: { items },
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
    }),
  } as unknown as OpenAIProvider;
  return provider;
}

describe('translateChapterTitlesBatch', () => {
  it('returns mapped translations from provider JSON', async () => {
    const provider = providerReturning([{ chapterId: 'ch-1', translatedTitle: 'Глава один' }]);
    const { results } = await translateChapterTitlesBatch(
      provider,
      [{ chapterId: 'ch-1', title: 'Chapter One' }],
      { sourceLanguage: 'en', targetLanguage: 'ru' }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]?.translatedTitle, 'Глава один');
  });

  it('returns empty results for empty input', async () => {
    const provider = providerReturning([]);
    const { results, tokensUsed } = await translateChapterTitlesBatch(provider, [], {
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    assert.deepEqual(results, []);
    assert.equal(tokensUsed.total, 0);
    assert.equal((provider.completeJSON as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  });
});
