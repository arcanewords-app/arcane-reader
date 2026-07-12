import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { NovelAgent } from '../agents/novel-agent.js';
import { TranslationPipeline } from './translation-pipeline.js';
import { clearAgentCache } from '../../services/engine-integration.js';
import { createMockProvider, mockCompletionResult } from '../test-helpers/mock-llm-provider.js';

const NOVEL_ID = 'pipeline-test';

function makeAgent() {
  return NovelAgent.create({
    novelId: NOVEL_ID,
    title: 'Pipeline Test',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  });
}

function fullPipelineProviders() {
  return {
    analysis: createMockProvider({
      completeJSON: async () => ({
        data: {
          characters: [{ name: 'Hero', suggestedTranslation: 'Герой', gender: 'male' }],
          chapterSummary: 'Hero chapter.',
          keyEvents: ['Hero acts'],
        },
        tokensUsed: { prompt: 10, completion: 10, total: 20 },
      }),
    }),
    translation: createMockProvider({
      completeJSON: async () => ({
        data: {
          paragraphs: [{ id: 'p1', translated: 'Черновой перевод главы.' }],
        },
        tokensUsed: { prompt: 12, completion: 18, total: 30 },
      }),
    }),
    editing: createMockProvider({
      complete: async () => mockCompletionResult('Отполированный перевод главы.'),
    }),
  };
}

describe('TranslationPipeline', () => {
  afterEach(() => {
    clearAgentCache(NOVEL_ID);
  });

  it('runs only editing stage with mocked provider', async () => {
    const edited = 'Polished chapter text.';
    const agent = makeAgent();
    const pipeline = new TranslationPipeline({
      provider: createMockProvider({
        complete: async () => mockCompletionResult(edited),
      }),
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

  it('runs analysis-only and applies glossary to agent', async () => {
    const agent = makeAgent();
    const pipeline = new TranslationPipeline({
      providers: fullPipelineProviders(),
      agent,
    });

    const result = await pipeline.translateChapter('Hero walks into town.', 1, {
      runStages: ['analysis'],
    });

    assert.equal(result.stage1.success, true);
    assert.equal(result.stage1.stage, 'analyze');
    assert.equal(result.finalTranslation, '');
    assert.equal(result.updatedContext.glossary.characters.length, 1);
    assert.equal(result.updatedContext.glossary.characters[0]?.originalName, 'Hero');
  });

  it('runs full three-stage pipeline with mocked LLM', async () => {
    const agent = makeAgent();
    const pipeline = new TranslationPipeline({
      providers: fullPipelineProviders(),
      agent,
    });

    const result = await pipeline.translateChapter('Hero source text.', 2, {
      skipAnalysis: false,
    });

    assert.equal(result.stage1.success, true);
    assert.equal(result.stage2.success, true);
    assert.equal(result.stage3.success, true);
    assert.ok(result.finalTranslation.includes('Отполированный'));
    assert.equal(result.updatedContext.glossary.characters.length, 1);
    assert.equal(agent.chapterCount, 1);
  });

  it('returns failed result when translation is cancelled mid-stage', async () => {
    const agent = makeAgent();
    let cancelChecks = 0;
    const pipeline = new TranslationPipeline({
      providers: {
        analysis: createMockProvider({
          completeJSON: async () => ({
            data: { chapterSummary: 'Skipped entities.' },
            tokensUsed: { prompt: 1, completion: 1, total: 2 },
          }),
        }),
        translation: createMockProvider({
          complete: async () => {
            throw new Error('transient translate failure');
          },
          completeJSON: async () => {
            throw new Error('json down');
          },
        }),
        editing: createMockProvider({
          complete: async () => mockCompletionResult('Should not run.'),
        }),
      },
      agent,
    });

    const result = await pipeline.translateChapter('Source.', 3, {
      skipAnalysis: true,
      runStages: ['translation'],
      retryAttempts: 1,
      chunkRetryDelayMs: 0,
      isCancelled: () => {
        cancelChecks += 1;
        return cancelChecks > 1;
      },
    });

    assert.equal(result.stage2.success, false);
    assert.match(result.stage2.error ?? '', /Cancelled/);
    assert.match(result.finalTranslation, /Cancelled/);
  });

  it('falls back to stage-2 text when editing fails', async () => {
    const agent = makeAgent();
    const draft = 'Черновой перевод без правки.';
    const pipeline = new TranslationPipeline({
      providers: {
        analysis: createMockProvider(),
        translation: createMockProvider({
          completeJSON: async () => ({
            data: { paragraphs: [{ id: 'p1', translated: draft }] },
            tokensUsed: { prompt: 5, completion: 5, total: 10 },
          }),
        }),
        editing: createMockProvider({
          complete: async () => {
            throw new Error('edit service unavailable');
          },
        }),
      },
      agent,
    });

    const result = await pipeline.translateChapter('Source paragraph.', 4, {
      skipAnalysis: true,
    });

    assert.equal(result.stage2.success, true);
    assert.equal(result.stage3.success, false);
    assert.ok(result.finalTranslation.includes('Черновой перевод'));
  });
});
