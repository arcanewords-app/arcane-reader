import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import type { ILLMProvider } from '../interfaces/llm-provider.js';
import { TranslateStage } from './stage-2-translate.js';

describe('TranslateStage JSON unwrap fallback', () => {
  it('unwraps paragraph JSON from text fallback when completeJSON fails', async () => {
    const agent = NovelAgent.create({
      novelId: 'stage2-smoke',
      title: 'Stage 2',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    const context = agent.getContext();

    const jsonPayload = JSON.stringify({
      paragraphs: [{ id: 'p1', translated: 'Привет, мир.' }],
    });

    const provider: ILLMProvider = {
      name: 'mock',
      model: 'gpt-4.1-mini',
      complete: async () => ({
        content: jsonPayload,
        tokensUsed: { prompt: 5, completion: 10, total: 15 },
        finishReason: 'stop',
        model: 'mock',
      }),
      completeJSON: async () => {
        throw new Error('json_object path unavailable');
      },
      isAvailable: async () => true,
      estimateTokens: (text) => Math.ceil(text.length / 4),
    };

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Hello world.', {
      context,
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
    });

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.ok(result.data!.translatedText.includes('Привет'));
    assert.equal(result.data!.chunkResults.length, 1);
    assert.ok(result.data!.chunkResults[0]!.translated.includes('Привет'));
  });
});
