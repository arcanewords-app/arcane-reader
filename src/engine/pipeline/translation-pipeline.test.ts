import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import type { ILLMProvider } from '../interfaces/llm-provider.js';
import { TranslationPipeline } from './translation-pipeline.js';
import { clearAgentCache } from '../../services/engine-integration.js';

function mockProvider(editedContent: string): ILLMProvider {
  return {
    name: 'mock',
    model: 'gpt-4.1-mini',
    complete: async () => ({
      content: editedContent,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
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
}

describe('TranslationPipeline smoke', () => {
  afterEach(() => {
    clearAgentCache('pipeline-smoke');
  });

  it('runs only editing stage with mocked provider', async () => {
    const edited = 'Polished chapter text.';
    const agent = NovelAgent.create({
      novelId: 'pipeline-smoke',
      title: 'Smoke',
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    const pipeline = new TranslationPipeline({
      provider: mockProvider(edited),
      agent,
    });

    const result = await pipeline.translateChapter('Original source paragraph.', 1, {
      runStages: ['editing'],
      existingTranslatedTextForEdit: 'Draft translation paragraph.',
      skipAnalysis: true,
    });

    assert.equal(result.chapterNumber, 1);
    assert.equal(result.finalTranslation, edited);
    assert.equal(result.stage3.stage, 'edit');
    assert.equal(result.stage3.success, true);
    assert.ok(result.totalTokensUsed > 0);
    assert.ok(result.updatedContext);
  });
});
