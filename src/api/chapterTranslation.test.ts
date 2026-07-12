import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTranslateChapterWithPipeline,
  mockGetStageModel,
  mockUpdateChapter,
  mockGetChapter,
  mockIncrementTokenUsage,
  mockInvalidateProjectAndRelatedCaches,
  mockAddGlossaryEntry,
} = vi.hoisted(() => ({
  mockTranslateChapterWithPipeline: vi.fn(),
  mockGetStageModel: vi.fn(() => 'gpt-4.1-mini'),
  mockUpdateChapter: vi.fn().mockResolvedValue(undefined),
  mockGetChapter: vi.fn(),
  mockIncrementTokenUsage: vi.fn().mockResolvedValue(undefined),
  mockInvalidateProjectAndRelatedCaches: vi.fn().mockResolvedValue(undefined),
  mockAddGlossaryEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/supabaseClient.js', () => ({
  supabase: {},
  createClientWithToken: vi.fn(),
}));

vi.mock('../services/supabaseDatabase.js', () => ({
  addGlossaryEntry: (...args: unknown[]) => mockAddGlossaryEntry(...args),
  updateGlossaryEntry: vi.fn().mockResolvedValue(undefined),
  getGlossaryEntry: vi.fn(),
  updateChapter: (...args: unknown[]) => mockUpdateChapter(...args),
  getChapter: (...args: unknown[]) => mockGetChapter(...args),
}));

vi.mock('../middleware/tokenLimits.js', () => ({
  incrementTokenUsage: (...args: unknown[]) => mockIncrementTokenUsage(...args),
}));

vi.mock('../services/engine-integration.js', () => ({
  translateChapterWithPipeline: mockTranslateChapterWithPipeline,
  getStageModel: mockGetStageModel,
}));

vi.mock('../services/cacheInvalidation.js', () => ({
  invalidateProjectAndRelatedCaches: (...args: unknown[]) =>
    mockInvalidateProjectAndRelatedCaches(...args),
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    openai: { apiKey: 'test-key', model: 'gpt-4.1-mini' },
    translation: { temperature: 0.7 },
  }),
}));

vi.mock('../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import type { Paragraph, Chapter, Project } from '../storage/database.js';
import {
  logTranslationCoverageIfIncomplete,
  mergeGlossaryAppearanceForChapter,
  performTranslation,
  syncTranslationChunksToParagraphs,
  syncTranslationToParagraphs,
} from './chapterTranslation.js';
import { getGlossaryEntry, updateGlossaryEntry } from '../services/supabaseDatabase.js';
import { translationCancelRegistry } from './routeHelpers.js';

const PARA_A = '0226e941-e174-461d-8945-9503b50aa761';
const PARA_B = 'e03cdd57-48d5-4b35-82eb-e98e224d6270';
const PARA_SEP = 'sep-0000-0000-0000-000000000001';

function makeParagraph(
  id: string,
  index: number,
  originalText: string,
  translatedText?: string
): Paragraph {
  return {
    id,
    index,
    originalText,
    translatedText,
    status: translatedText ? 'translated' : 'pending',
  } as Paragraph;
}

describe('chapterTranslation sync helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncTranslationToParagraphs maps double-newline parts to empty paragraphs', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph(PARA_B, 1, 'World')];
    const result = syncTranslationToParagraphs(originals, 'Привет\n\nМир');
    assert.equal(result[0].translatedText, 'Привет');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationToParagraphs preserves existing translations unless replaceAll', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello', 'Existing'),
      makeParagraph(PARA_B, 1, 'World'),
    ];
    const result = syncTranslationToParagraphs(originals, 'Новый\n\nМир');
    assert.equal(result[0].translatedText, 'Existing');
    assert.equal(result[1].translatedText, 'Новый');

    const replaced = syncTranslationToParagraphs(originals, 'A\n\nB', { replaceAll: true });
    assert.equal(replaced[0].translatedText, 'A');
    assert.equal(replaced[1].translatedText, 'B');
  });

  it('syncTranslationToParagraphs skips separator paragraphs', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello'),
      makeParagraph(PARA_SEP, 1, '***'),
      makeParagraph(PARA_B, 2, 'World'),
    ];
    const result = syncTranslationToParagraphs(originals, 'A\n\nB');
    assert.equal(result[1].originalText, '***');
    assert.equal(result[1].translatedText, undefined);
    assert.equal(result[0].translatedText, 'A');
    assert.equal(result[2].translatedText, 'B');
  });

  it('syncTranslationToParagraphs returns originals unchanged for empty translation', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello')];
    const result = syncTranslationToParagraphs(originals, '   ');
    assert.deepEqual(result, originals);
  });

  it('syncTranslationChunksToParagraphs maps chunks to paragraphs', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello'), makeParagraph(PARA_B, 1, 'World')];
    const result = syncTranslationChunksToParagraphs(originals, ['Привет', 'Мир']);
    assert.equal(result[0].translatedText, 'Привет');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationChunksToParagraphs preserves existing in partial mode', () => {
    const originals = [
      makeParagraph(PARA_A, 0, 'Hello', 'Keep'),
      makeParagraph(PARA_B, 1, 'World'),
    ];
    const result = syncTranslationChunksToParagraphs(originals, ['Мир'], true);
    assert.equal(result[0].translatedText, 'Keep');
    assert.equal(result[1].translatedText, 'Мир');
  });

  it('syncTranslationChunksToParagraphs merges excess chunks into last content paragraph', () => {
    const originals = [makeParagraph(PARA_A, 0, 'Hello')];
    const result = syncTranslationChunksToParagraphs(originals, ['Part1', 'Part2']);
    assert.equal(result[0].translatedText, 'Part1\n\nPart2');
  });

  it('logTranslationCoverageIfIncomplete returns coverage and warns when incomplete', async () => {
    const { logger } = await import('../logger.js');
    const paragraphs = [makeParagraph(PARA_A, 0, 'Hello', 'Hi'), makeParagraph(PARA_B, 1, 'World')];
    const coverage = logTranslationCoverageIfIncomplete('proj-1', 'ch-1', paragraphs);
    assert.equal(coverage.isComplete, false);
    assert.equal(coverage.translatedCount, 1);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('mergeGlossaryAppearanceForChapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('merges chapter number into mentionedInChapters', async () => {
    vi.mocked(getGlossaryEntry).mockResolvedValue({
      id: 'g1',
      type: 'character',
      original: 'Alice',
      translated: 'Алиса',
      mentionedInChapters: [1],
    } as never);
    vi.mocked(updateGlossaryEntry).mockResolvedValue(undefined);

    await mergeGlossaryAppearanceForChapter('proj-1', ['g1'], 3, 'token', {
      chapterId: 'ch-1',
    });

    assert.equal(vi.mocked(updateGlossaryEntry).mock.calls.length, 1);
    const updates = vi.mocked(updateGlossaryEntry).mock.calls[0]?.[2] as {
      mentionedInChapters?: number[];
    };
    assert.deepEqual(updates.mentionedInChapters, [1, 3]);
  });

  it('skips missing glossary entries', async () => {
    vi.mocked(getGlossaryEntry).mockResolvedValue(null);
    await mergeGlossaryAppearanceForChapter('proj-1', ['missing'], 2, 'token', {});
    assert.equal(vi.mocked(updateGlossaryEntry).mock.calls.length, 0);
  });

  it('does not duplicate chapter number in mentionedInChapters', async () => {
    vi.mocked(getGlossaryEntry).mockResolvedValue({
      id: 'g1',
      type: 'character',
      original: 'Alice',
      translated: 'Алиса',
      mentionedInChapters: [3],
    } as never);
    vi.mocked(updateGlossaryEntry).mockResolvedValue(undefined);
    await mergeGlossaryAppearanceForChapter('proj-1', ['g1'], 3, 'token', {});
    const updates = vi.mocked(updateGlossaryEntry).mock.calls[0]?.[2] as {
      mentionedInChapters?: number[];
    };
    assert.deepEqual(updates.mentionedInChapters, [3]);
  });
});

function makeTestChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'Chapter 1',
    originalText: 'Hello world.',
    status: 'pending',
    paragraphs: [
      {
        id: PARA_A,
        index: 0,
        originalText: 'Hello world.',
        status: 'pending',
      },
    ],
    ...overrides,
  } as Chapter;
}

function makeTestProject(): Project {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'novel',
    settings: {},
    chapters: [],
    glossary: [],
    sourceLanguage: 'en',
    targetLanguage: 'ru',
  } as unknown as Project;
}

describe('performTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationCancelRegistry.clear();
    mockTranslateChapterWithPipeline.mockResolvedValue({
      translatedText: 'Привет мир.',
      tokensUsed: 100,
      tokensByStage: { translation: 100 },
      duration: 500,
      glossaryUpdates: [],
      glossaryUpdatesExisting: [],
      glossaryAppearanceEntryIds: [],
    });
    mockGetChapter.mockImplementation(async () => makeTestChapter());
    mockUpdateChapter.mockResolvedValue(undefined);
  });

  afterEach(() => {
    translationCancelRegistry.clear();
  });

  it('runs translation-only pipeline and updates chapter', async () => {
    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation']
    );

    assert.equal(mockTranslateChapterWithPipeline.mock.calls.length, 1);
    assert.equal(mockUpdateChapter.mock.calls.length, 1);
    assert.equal(mockIncrementTokenUsage.mock.calls.length, 1);
    assert.equal(mockInvalidateProjectAndRelatedCaches.mock.calls.length, 1);
  });

  it('returns early when cancelled before pipeline start', async () => {
    translationCancelRegistry.set('proj-1:ch-1', true);
    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1'
    );
    assert.equal(mockTranslateChapterWithPipeline.mock.calls.length, 0);
    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'pending');
  });

  it('handles analysis-only run and sets analyzed status', async () => {
    mockTranslateChapterWithPipeline.mockResolvedValue({
      tokensUsed: 50,
      tokensByStage: { analysis: 50 },
      duration: 200,
      glossaryUpdates: [
        {
          type: 'character',
          original: 'Bob',
          translated: 'Боб',
          mentionedInChapters: [1],
          imageUrls: [],
        },
      ],
      glossaryUpdatesExisting: [],
      glossaryAppearanceEntryIds: ['g-new'],
    });

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['analysis']
    );

    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'analyzed');
    assert.equal(mockIncrementTokenUsage.mock.calls.length, 1);
  });

  it('marks chapter completed when no empty paragraphs in translateOnlyEmpty mode', async () => {
    const chapter = makeTestChapter({
      paragraphs: [
        {
          id: PARA_A,
          index: 0,
          originalText: 'Hello.',
          translatedText: 'Привет.',
          status: 'translated',
        },
      ],
    });
    await performTranslation(
      'proj-1',
      'ch-1',
      chapter,
      makeTestProject(),
      Date.now(),
      true,
      'token',
      'user-1'
    );
    assert.equal(mockTranslateChapterWithPipeline.mock.calls.length, 0);
    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'completed');
  });

  it('saves pending status when pipeline returns cancelled after analysis', async () => {
    mockTranslateChapterWithPipeline.mockResolvedValue({
      cancelled: true,
      tokensUsed: 30,
      tokensByStage: { analysis: 30 },
      duration: 100,
      glossaryUpdates: [],
      glossaryUpdatesExisting: [],
    });

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['analysis', 'translation']
    );

    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'pending');
  });

  it('marks chapter error when validation fails', async () => {
    mockTranslateChapterWithPipeline.mockResolvedValue({
      translatedText: '',
      tokensUsed: 10,
      tokensByStage: { translation: 10 },
      duration: 50,
    });

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation']
    );

    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'error');
  });

  it('handles Cancelled error and resets chapter to pending', async () => {
    mockTranslateChapterWithPipeline.mockRejectedValue(new Error('Cancelled'));
    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1'
    );
    assert.equal(mockUpdateChapter.mock.calls.at(-1)?.[2]?.status, 'pending');
  });

  it('runs two-phase editing and saves completed chapter after phase 2', async () => {
    const translatedChapter = makeTestChapter({
      translatedText: 'Привет мир.',
      paragraphs: [
        {
          id: PARA_A,
          index: 0,
          originalText: 'Hello world.',
          translatedText: 'Привет мир.',
          status: 'translated',
        },
      ],
    });
    mockTranslateChapterWithPipeline
      .mockResolvedValueOnce({
        translatedText: 'Привет мир.',
        tokensUsed: 80,
        tokensByStage: { translation: 80 },
        duration: 300,
        glossaryUpdates: [],
        glossaryUpdatesExisting: [],
      })
      .mockResolvedValueOnce({
        translatedText: 'Отредактированный текст.',
        tokensUsed: 40,
        tokensByStage: { editing: 40 },
        duration: 200,
      });
    mockGetChapter.mockImplementation(async () => translatedChapter);

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation', 'editing']
    );

    assert.equal(mockTranslateChapterWithPipeline.mock.calls.length, 2);
    const phase2Options = mockTranslateChapterWithPipeline.mock.calls[1]?.[3] as {
      stages?: string[];
    };
    assert.deepEqual(phase2Options?.stages, ['editing']);
    const finalUpdate = mockUpdateChapter.mock.calls.at(-1)?.[2] as {
      status?: string;
      translationMeta?: { model?: string };
    };
    assert.equal(finalUpdate?.status, 'completed');
    assert.ok(finalUpdate?.translationMeta?.model?.includes('/'));
  });

  it('keeps draft when phase 2 editing returns invalid text', async () => {
    mockTranslateChapterWithPipeline
      .mockResolvedValueOnce({
        translatedText: 'Draft translation.',
        tokensUsed: 50,
        tokensByStage: { translation: 50 },
        duration: 100,
      })
      .mockResolvedValueOnce({
        translatedText: '',
        tokensUsed: 10,
        tokensByStage: { editing: 10 },
        duration: 50,
      });
    mockGetChapter.mockImplementation(async () =>
      makeTestChapter({
        translatedText: 'Draft translation.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'Draft translation.',
            status: 'translated',
          },
        ],
      })
    );

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation', 'editing']
    );

    const statuses = mockUpdateChapter.mock.calls.map((c) => (c[2] as { status?: string }).status);
    assert.ok(statuses.includes('draft'));
    assert.equal(statuses.at(-1), 'draft');
  });

  it('preserves draft status when editing stage throws after phase 1', async () => {
    mockTranslateChapterWithPipeline
      .mockResolvedValueOnce({
        translatedText: 'Phase one text.',
        tokensUsed: 60,
        tokensByStage: { translation: 60 },
        duration: 120,
      })
      .mockRejectedValueOnce(new Error('Editing pipeline failed'));
    mockGetChapter.mockImplementation(async () =>
      makeTestChapter({
        translatedText: 'Phase one text.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'Phase one text.',
            status: 'translated',
          },
        ],
      })
    );

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation', 'editing']
    );

    const statuses = mockUpdateChapter.mock.calls.map((c) => (c[2] as { status?: string }).status);
    assert.ok(statuses.includes('draft'));
    assert.equal(statuses.at(-1), 'draft');
  });

  it('runs editing-only stage and syncs marker-based output', async () => {
    const markerText = `--para:${PARA_A}--Edited paragraph.`;
    mockTranslateChapterWithPipeline.mockResolvedValue({
      translatedText: markerText,
      tokensUsed: 25,
      tokensByStage: { editing: 25 },
      duration: 80,
    });
    mockGetChapter.mockImplementation(async () =>
      makeTestChapter({
        translatedText: 'Old draft.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'Old draft.',
            status: 'translated',
          },
        ],
      })
    );

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter({
        translatedText: 'Old draft.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'Old draft.',
            status: 'translated',
          },
        ],
      }),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['editing']
    );

    assert.equal(mockTranslateChapterWithPipeline.mock.calls.length, 1);
    const updatePayload = mockUpdateChapter.mock.calls.at(-1)?.[2] as {
      paragraphs?: Array<{ translatedText?: string }>;
      status?: string;
    };
    assert.equal(updatePayload?.paragraphs?.[0]?.translatedText, 'Edited paragraph.');
    assert.equal(updatePayload?.status, 'completed');
  });

  it('saves new and updated glossary entries after successful translation', async () => {
    mockTranslateChapterWithPipeline.mockResolvedValue({
      translatedText: 'Привет мир.',
      tokensUsed: 100,
      tokensByStage: { translation: 100 },
      duration: 500,
      glossaryUpdates: [{ type: 'character', original: 'Bob', translated: 'Боб' }],
      glossaryUpdatesExisting: [{ id: 'g-existing', updates: { translated: 'Алиса' } }],
      glossaryAppearanceEntryIds: ['g-existing'],
    });
    mockGetChapter.mockImplementation(async () =>
      makeTestChapter({
        translatedText: 'Привет мир.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'Привет мир.',
            status: 'translated',
          },
        ],
      })
    );

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation']
    );

    assert.equal(mockAddGlossaryEntry.mock.calls.length, 1);
    assert.equal(vi.mocked(updateGlossaryEntry).mock.calls.length, 2);
  });

  it('saves glossary updates when cancelled after analysis in multi-stage run', async () => {
    mockTranslateChapterWithPipeline.mockResolvedValue({
      cancelled: true,
      tokensUsed: 30,
      tokensByStage: { analysis: 30 },
      duration: 100,
      glossaryUpdates: [{ type: 'term', original: 'magic', translated: 'магия' }],
      glossaryUpdatesExisting: [{ id: 'g-1', updates: { notes: 'updated' } }],
      glossaryAppearanceEntryIds: ['g-1'],
    });

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['analysis', 'translation']
    );

    assert.equal(mockAddGlossaryEntry.mock.calls.length, 1);
    assert.equal(vi.mocked(updateGlossaryEntry).mock.calls.length, 2);
    assert.equal(mockUpdateChapter.mock.calls[0]?.[2]?.status, 'pending');
  });

  it('syncs JSON-formatted translation to paragraphs', async () => {
    const jsonText = JSON.stringify({
      paragraphs: [{ id: PARA_A, translated: 'JSON перевод.' }],
    });
    mockTranslateChapterWithPipeline.mockResolvedValue({
      translatedText: jsonText,
      tokensUsed: 90,
      tokensByStage: { translation: 90 },
      duration: 400,
    });
    mockGetChapter.mockImplementation(async () =>
      makeTestChapter({
        translatedText: 'JSON перевод.',
        paragraphs: [
          {
            id: PARA_A,
            index: 0,
            originalText: 'Hello world.',
            translatedText: 'JSON перевод.',
            status: 'translated',
          },
        ],
      })
    );

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation']
    );

    const updatePayload = mockUpdateChapter.mock.calls.at(-1)?.[2] as {
      paragraphs?: Array<{ translatedText?: string }>;
      status?: string;
    };
    assert.equal(updatePayload?.paragraphs?.[0]?.translatedText, 'JSON перевод.');
    assert.equal(updatePayload?.status, 'completed');
  });

  it('marks chapter error on non-cancelled pipeline failure', async () => {
    mockTranslateChapterWithPipeline.mockRejectedValue(new Error('Pipeline exploded'));
    mockGetChapter.mockResolvedValue(makeTestChapter({ translatedText: 'Existing text.' }));

    await performTranslation(
      'proj-1',
      'ch-1',
      makeTestChapter(),
      makeTestProject(),
      Date.now(),
      false,
      'token',
      'user-1',
      undefined,
      ['translation']
    );

    const updatePayload = mockUpdateChapter.mock.calls.at(-1)?.[2] as {
      status?: string;
      translatedText?: string;
    };
    assert.equal(updatePayload?.status, 'error');
    assert.equal(updatePayload?.translatedText, 'Existing text.');
  });
});
