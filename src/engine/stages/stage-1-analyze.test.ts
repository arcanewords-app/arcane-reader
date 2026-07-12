import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { ILLMProvider } from '../interfaces/llm-provider.js';
import { AnalyzeStage } from './stage-1-analyze.js';

describe('AnalyzeStage smoke', () => {
  it('returns analysis result from mocked completeJSON', async () => {
    const provider: ILLMProvider = {
      name: 'mock',
      model: 'gpt-4.1-mini',
      complete: async () => ({
        content: '{}',
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
        finishReason: 'stop',
        model: 'mock',
      }),
      completeJSON: async () => ({
        data: {
          characters: [],
          locations: [],
          terms: [],
          chapterSummary: 'summary',
        },
        tokensUsed: { prompt: 10, completion: 20, total: 30 },
      }),
      isAvailable: async () => true,
      estimateTokens: (text) => Math.ceil(text.length / 4),
    };

    const stage = new AnalyzeStage(provider);
    const result = await stage.execute('Short chapter text.', {
      chapterNumber: 1,
      sourceLanguage: 'en',
      targetLanguage: 'ru',
      maxSectionTokens: 0,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.chapterNumber, 1);
  });
});
