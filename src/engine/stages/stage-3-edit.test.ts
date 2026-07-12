import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import type { ILLMProvider } from '../interfaces/llm-provider.js';
import { EditStage } from './stage-3-edit.js';

describe('EditStage smoke', () => {
  it('returns edited translation from mocked complete', async () => {
    const agent = NovelAgent.create({
      novelId: 'stage3-smoke',
      title: 'Stage 3',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    const context = agent.getContext();

    const provider: ILLMProvider = {
      name: 'mock',
      model: 'gpt-4.1-mini',
      complete: async () => ({
        content: 'Отредактированный текст.',
        tokensUsed: { prompt: 5, completion: 8, total: 13 },
        finishReason: 'stop',
        model: 'mock',
      }),
      completeJSON: async <T>() => ({
        data: {} as T,
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      }),
      isAvailable: async () => true,
      estimateTokens: (text) => Math.ceil(text.length / 4),
    };

    const stage = new EditStage(provider);
    const result = await stage.execute('Translated text.', 'Original text.', {
      chapterNumber: 1,
      context,
      includeGlossary: false,
      forceSingleShot: true,
    });

    assert.equal(result.success, true);
    assert.ok(result.data?.finalText.includes('Отредактированный'));
  });
});
