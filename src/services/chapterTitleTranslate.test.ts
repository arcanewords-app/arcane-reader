import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

const {
  updateChapter,
  incrementTokenUsage,
  resolveEffectiveLanguagePair,
  translateChapterTitlesBatch,
} = vi.hoisted(() => ({
  updateChapter: vi.fn(),
  incrementTokenUsage: vi.fn(),
  resolveEffectiveLanguagePair: vi.fn(),
  translateChapterTitlesBatch: vi.fn(),
}));

vi.mock('./supabaseDatabase.js', () => ({
  updateChapter: (...args: unknown[]) => updateChapter(...args),
}));

vi.mock('../middleware/tokenLimits.js', () => ({
  incrementTokenUsage: (...args: unknown[]) => incrementTokenUsage(...args),
}));

vi.mock('./engine-integration.js', () => ({
  resolveEffectiveLanguagePair: (...args: unknown[]) => resolveEffectiveLanguagePair(...args),
}));

vi.mock('../engine/title-translate.js', () => ({
  translateChapterTitlesBatch: (...args: unknown[]) => translateChapterTitlesBatch(...args),
}));

vi.mock('../engine/providers/openai.js', () => ({
  OpenAIProvider: class {
    constructor(public opts: unknown) {}
  },
}));

vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { AppConfig } from '../config.js';
import type { ChapterStatus } from '../storage/types.js';
import {
  applyChapterTitleTranslations,
  collectTitleTranslationCandidates,
} from './chapterTitleTranslate.js';

const baseConfig = {
  openai: {
    apiKey: 'sk-test',
    model: 'gpt-4.1-mini',
    timeout: 60000,
    maxRetries: 1,
  },
} as AppConfig;

const project = {
  id: 'proj-1',
  name: 'Novel',
  userId: 'u1',
  sourceLanguage: 'en',
  targetLanguage: 'ru',
  glossary: [
    {
      id: 'g1',
      type: 'character' as const,
      original: 'Alice',
      translated: 'Алиса',
      description: '',
      mentionedInChapters: [],
    },
  ],
  settings: {
    stageModels: { translation: 'gpt-5.1-codex-mini' },
    temperature: 0.4,
  },
  chapters: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('collectTitleTranslationCandidates', () => {
  const chapter = {
    id: 'ch-1',
    number: 1,
    title: 'Chapter 1',
    translatedTitle: '',
    status: 'completed' as ChapterStatus,
    translatedText: 'text',
  };

  it('returns empty when title translation disabled', () => {
    const result = collectTitleTranslationCandidates([chapter], {
      translateChapterTitles: false,
      translateOnlyEmpty: false,
      stages: 'all',
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });

  it('returns empty when stages exclude translation', () => {
    const result = collectTitleTranslationCandidates([chapter], {
      translateChapterTitles: true,
      translateOnlyEmpty: false,
      stages: ['analysis'],
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });

  it('marks generic titles as non-LLM and skips empty titles', () => {
    const result = collectTitleTranslationCandidates(
      [
        chapter,
        { ...chapter, id: 'ch-2', number: 2, title: 'The Rising Flame' },
        { ...chapter, id: 'ch-3', number: 3, title: '   ' },
      ],
      {
        translateChapterTitles: true,
        translateOnlyEmpty: false,
        stages: ['translation'],
        succeededChapterIds: new Set(['ch-1', 'ch-2', 'ch-3']),
      }
    );
    assert.equal(result.length, 2);
    assert.equal(result[0]?.useLlm, false);
    assert.equal(result[1]?.useLlm, true);
  });

  it('skips chapter when translateOnlyEmpty and translated title exists', () => {
    const result = collectTitleTranslationCandidates([{ ...chapter, translatedTitle: 'Глава 1' }], {
      translateChapterTitles: true,
      translateOnlyEmpty: true,
      stages: 'all',
      succeededChapterIds: new Set(['ch-1']),
    });
    assert.deepEqual(result, []);
  });
});

describe('applyChapterTitleTranslations', () => {
  beforeEach(() => {
    updateChapter.mockReset().mockResolvedValue(undefined);
    incrementTokenUsage.mockReset().mockResolvedValue(undefined);
    resolveEffectiveLanguagePair.mockReturnValue({
      sourceLanguage: 'en',
      targetLanguage: 'ru',
    });
    translateChapterTitlesBatch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 0 for empty candidates or missing API key', async () => {
    assert.equal(
      await applyChapterTitleTranslations(baseConfig, 'proj-1', project as never, [], {
        userId: 'u1',
        token: 't',
      }),
      0
    );
    assert.equal(
      await applyChapterTitleTranslations(
        { ...baseConfig, openai: { ...baseConfig.openai, apiKey: '' } },
        'proj-1',
        project as never,
        [{ chapterId: 'ch-1', number: 1, sourceTitle: 'Chapter 1', useLlm: false }],
        { userId: 'u1', token: 't' }
      ),
      0
    );
  });

  it('localizes generic titles without calling LLM', async () => {
    const tokens = await applyChapterTitleTranslations(
      baseConfig,
      'proj-1',
      project as never,
      [{ chapterId: 'ch-1', number: 1, sourceTitle: 'Chapter 1', useLlm: false }],
      { userId: 'u1', token: 't' }
    );
    assert.equal(tokens, 0);
    assert.equal(updateChapter.mock.calls.length, 1);
    assert.equal(translateChapterTitlesBatch.mock.calls.length, 0);
    assert.match(String(updateChapter.mock.calls[0]?.[2]?.translatedTitle ?? ''), /1/);
  });

  it('translates LLM candidates, records tokens, and respects cancel', async () => {
    translateChapterTitlesBatch.mockResolvedValue({
      results: [{ chapterId: 'ch-2', translatedTitle: 'Восходящее пламя' }],
      tokensUsed: { total: 12 },
    });

    let cancelled = false;
    const tokens = await applyChapterTitleTranslations(
      baseConfig,
      'proj-1',
      project as never,
      [
        { chapterId: 'ch-1', number: 1, sourceTitle: 'Chapter 1', useLlm: false },
        { chapterId: 'ch-2', number: 2, sourceTitle: 'Alice Rising', useLlm: true },
      ],
      {
        userId: 'u1',
        token: 't',
        userRole: 'author',
        isCancelled: () => cancelled,
      }
    );
    assert.equal(tokens, 12);
    assert.ok(updateChapter.mock.calls.some((c) => c[2]?.translatedTitle === 'Восходящее пламя'));
    assert.equal(incrementTokenUsage.mock.calls[0]?.[2], 12);

    cancelled = true;
    translateChapterTitlesBatch.mockClear();
    const cancelledTokens = await applyChapterTitleTranslations(
      baseConfig,
      'proj-1',
      project as never,
      [{ chapterId: 'ch-3', number: 3, sourceTitle: 'Alice Again', useLlm: true }],
      { userId: 'u1', token: 't', isCancelled: () => true }
    );
    assert.equal(cancelledTokens, 0);
    assert.equal(translateChapterTitlesBatch.mock.calls.length, 0);
  });

  it('continues when batch translation or token accounting fails', async () => {
    translateChapterTitlesBatch.mockRejectedValueOnce(new Error('llm down'));
    const tokens = await applyChapterTitleTranslations(
      baseConfig,
      'proj-1',
      project as never,
      [{ chapterId: 'ch-2', number: 2, sourceTitle: 'Alice Rising', useLlm: true }],
      { userId: 'u1', token: 't' }
    );
    assert.equal(tokens, 0);

    translateChapterTitlesBatch.mockResolvedValue({
      results: [{ chapterId: 'ch-2', translatedTitle: 'X' }],
      tokensUsed: { total: 5 },
    });
    incrementTokenUsage.mockRejectedValueOnce(new Error('token write failed'));
    const tokens2 = await applyChapterTitleTranslations(
      baseConfig,
      'proj-1',
      project as never,
      [{ chapterId: 'ch-2', number: 2, sourceTitle: 'Alice Rising', useLlm: true }],
      { userId: 'u1', token: 't' }
    );
    assert.equal(tokens2, 5);
  });
});
