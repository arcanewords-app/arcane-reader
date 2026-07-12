import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import { TranslateStage } from './stage-2-translate.js';
import { createMockProvider, mockCompletionResult } from '../test-helpers/mock-llm-provider.js';
import { isChunkError } from '../constants/errors.js';

function makeAgent() {
  return NovelAgent.create({
    novelId: 'stage2-test',
    title: 'Stage 2',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
}

describe('TranslateStage', () => {
  it('unwraps paragraph JSON from text fallback when completeJSON fails', async () => {
    const agent = makeAgent();
    const jsonPayload = JSON.stringify({
      paragraphs: [{ id: 'p1', translated: 'Привет, мир.' }],
    });

    const provider = createMockProvider({
      complete: async () => mockCompletionResult(jsonPayload),
      completeJSON: async () => {
        throw new Error('json_object path unavailable');
      },
    });

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Hello world.', {
      context: agent.getContext(),
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
    });

    assert.equal(result.success, true);
    assert.ok(result.data?.translatedText.includes('Привет'));
    assert.equal(result.data?.chunkResults.length, 1);
    assert.ok(result.data?.chunkResults[0]!.translated.includes('Привет'));
  });

  it('translates via completeJSON when paragraphs are returned', async () => {
    const agent = makeAgent();
    const provider = createMockProvider({
      completeJSON: async () => ({
        data: {
          paragraphs: [{ id: 'p1', translated: 'Перевод через JSON.' }],
        },
        tokensUsed: { prompt: 8, completion: 12, total: 20 },
      }),
    });

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Source paragraph.', {
      context: agent.getContext(),
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
    });

    assert.equal(result.success, true);
    assert.ok(result.data?.translatedText.includes('Перевод через JSON'));
    assert.equal(result.data?.chunkResults[0]?.completionPath, 'json_object');
  });

  it('retries after empty translation and succeeds on second attempt', async () => {
    const agent = makeAgent();
    let completeCalls = 0;
    const provider = createMockProvider({
      complete: async () => {
        completeCalls += 1;
        if (completeCalls === 1) {
          return mockCompletionResult('   ');
        }
        return mockCompletionResult('Успешный перевод.');
      },
      completeJSON: async () => {
        throw new Error('force text fallback');
      },
    });

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Retry me.', {
      context: agent.getContext(),
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
      chunkRetryAttempts: 1,
      chunkRetryDelayMs: 0,
    });

    assert.equal(result.success, true);
    assert.equal(completeCalls, 2);
    assert.ok(result.data?.translatedText.includes('Успешный перевод'));
  });

  it('embeds chunk error in result after retries are exhausted', async () => {
    const agent = makeAgent();
    const provider = createMockProvider({
      complete: async () => {
        throw new Error('provider timeout');
      },
      completeJSON: async () => {
        throw new Error('json unavailable');
      },
    });

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Fail chunk.', {
      context: agent.getContext(),
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
      chunkRetryAttempts: 0,
      chunkRetryDelayMs: 0,
    });

    assert.equal(result.success, true);
    const chunkText = result.data?.chunkResults[0]?.translated ?? '';
    assert.ok(isChunkError(chunkText));
    assert.match(result.data?.chunkResults[0]?.error ?? '', /timeout/);
  });

  it('propagates cancellation during chunk retry', async () => {
    const agent = makeAgent();
    let completeCalls = 0;
    const provider = createMockProvider({
      complete: async () => {
        completeCalls += 1;
        throw new Error('transient failure');
      },
      completeJSON: async () => {
        throw new Error('json unavailable');
      },
    });

    const stage = new TranslateStage(provider);
    const result = await stage.execute('Cancel during retry.', {
      context: agent.getContext(),
      chapterNumber: 1,
      translateExecutionMode: 'one_shot',
      includeGlossary: false,
      enableTranslateCoT: false,
      enableTranslateStructuredCoT: false,
      chunkRetryAttempts: 2,
      chunkRetryDelayMs: 0,
      isCancelled: () => completeCalls >= 1,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Cancelled/);
  });
});
