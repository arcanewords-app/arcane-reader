import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import { EditStage } from './stage-3-edit.js';
import { createMockProvider, mockCompletionResult } from '../test-helpers/mock-llm-provider.js';

function makeAgent() {
  return NovelAgent.create({
    novelId: 'stage3-test',
    title: 'Stage 3',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
}

describe('EditStage', () => {
  it('returns edited translation from mocked complete (single-shot)', async () => {
    const agent = makeAgent();
    const provider = createMockProvider({
      complete: async () => mockCompletionResult('Отредактированный текст.'),
    });

    const stage = new EditStage(provider);
    const result = await stage.execute('Translated text.', 'Original text.', {
      chapterNumber: 1,
      context: agent.getContext(),
      includeGlossary: false,
      forceSingleShot: true,
    });

    assert.equal(result.success, true);
    assert.ok(result.data?.finalText.includes('Отредактированный'));
    assert.ok(Array.isArray(result.data?.changes));
  });

  it('retries chunked edit after failure and succeeds on second attempt', async () => {
    const agent = makeAgent();
    let completeCalls = 0;
    const provider = createMockProvider({
      complete: async () => {
        completeCalls += 1;
        if (completeCalls === 1) {
          throw new Error('edit provider glitch');
        }
        return mockCompletionResult('Исправленный фрагмент.');
      },
    });

    const stage = new EditStage(provider);
    const result = await stage.execute('Черновой перевод.', 'Original.', {
      chapterNumber: 1,
      context: agent.getContext(),
      includeGlossary: false,
      forceChunked: true,
      chunkSize: 500,
      chunkRetryAttempts: 1,
      chunkRetryDelayMs: 0,
    });

    assert.equal(result.success, true);
    assert.equal(completeCalls, 2);
    assert.ok(result.data?.finalText.includes('Исправленный'));
  });

  it('includes quality score when checkQuality succeeds via completeJSON', async () => {
    const agent = makeAgent();
    let jsonCalls = 0;
    const provider = createMockProvider({
      complete: async () => mockCompletionResult('Отполированный текст.'),
      completeJSON: async () => {
        jsonCalls += 1;
        return {
          data: { score: 8.5, issues: [], suggestions: [] },
          tokensUsed: { prompt: 4, completion: 4, total: 8 },
        };
      },
    });

    const stage = new EditStage(provider);
    const result = await stage.execute('Черновик.', 'Original.', {
      chapterNumber: 1,
      context: agent.getContext(),
      includeGlossary: false,
      forceSingleShot: true,
      checkQuality: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.qualityScore, 8.5);
    assert.equal(jsonCalls, 1);
  });

  it('returns failure when provider throws before any output', async () => {
    const agent = makeAgent();
    const provider = createMockProvider({
      complete: async () => {
        throw new Error('edit catastrophic failure');
      },
    });

    const stage = new EditStage(provider);
    const result = await stage.execute('Draft.', 'Original.', {
      chapterNumber: 1,
      context: agent.getContext(),
      includeGlossary: false,
      forceSingleShot: true,
      chunkRetryAttempts: 0,
      chunkRetryDelayMs: 0,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /catastrophic failure/);
  });

  it('propagates cancellation during chunked edit retry', async () => {
    const agent = makeAgent();
    let completeCalls = 0;
    const provider = createMockProvider({
      complete: async () => {
        completeCalls += 1;
        throw new Error('chunk edit failed');
      },
    });

    const stage = new EditStage(provider);
    const result = await stage.execute('Draft for cancel.', 'Original.', {
      chapterNumber: 1,
      context: agent.getContext(),
      includeGlossary: false,
      forceChunked: true,
      chunkRetryAttempts: 2,
      chunkRetryDelayMs: 0,
      isCancelled: () => completeCalls >= 1,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Cancelled/);
  });
});
