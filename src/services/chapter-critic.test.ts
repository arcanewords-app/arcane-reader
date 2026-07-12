import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { Chapter, Project } from '../storage/database.js';
import {
  buildCriticChapterTexts,
  computeCriticContentFingerprint,
  computeCriticInputStats,
  CriticChapterTooLongError,
  CriticInputTooLargeError,
  CriticNoTranslationError,
  CriticOutputTruncatedError,
  runChapterCritic,
} from './chapter-critic.js';
import {
  CRITIC_CHUNKED_PARAGRAPH_THRESHOLD,
  CRITIC_MAX_INPUT_CHARS,
} from '../shared/critic-limits.js';

const emptyGlossary = {
  novelId: 'proj-1',
  version: 1,
  lastUpdated: new Date(),
  characters: [],
  locations: [],
  terms: [],
};

const { mockCompleteStructuredJSON, mockGetAgentForProject } = vi.hoisted(() => ({
  mockCompleteStructuredJSON: vi.fn(),
  mockGetAgentForProject: vi.fn(),
}));

vi.mock('../config.js', () => ({
  loadConfig: () => ({
    openai: { apiKey: 'test-key', model: 'gpt-4.1-mini' },
  }),
}));

vi.mock('./engine-integration.js', () => ({
  getAgentForProject: (...args: unknown[]) => mockGetAgentForProject(...args),
}));

vi.mock('../engine/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/index.js')>();
  class MockOpenAIProvider {
    completeStructuredJSON = mockCompleteStructuredJSON;
    completeJSON = mockCompleteStructuredJSON;
  }
  return {
    ...actual,
    OpenAIProvider: MockOpenAIProvider,
  };
});

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'Chapter',
    originalText: 'Hello.',
    translatedText: 'Привет.',
    paragraphs: [
      {
        id: 'p1',
        index: 0,
        originalText: 'Hello.',
        translatedText: 'Привет.',
        status: 'translated',
      },
    ],
    status: 'completed',
    ...overrides,
  };
}

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'text',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapters: [makeChapter()],
    glossary: [],
    settings: {} as Project['settings'],
    createdAt: '',
    updatedAt: '',
  };
}

describe('chapter-critic pure helpers', () => {
  it('buildCriticChapterTexts sorts paragraphs by index', () => {
    const chapter = makeChapter({
      paragraphs: [
        { id: 'p2', index: 2, originalText: 'B', translatedText: 'Б', status: 'translated' },
        { id: 'p1', index: 1, originalText: 'A', translatedText: 'А', status: 'translated' },
      ],
    });

    const texts = buildCriticChapterTexts(chapter);
    assert.deepEqual(texts.sourceTexts, ['A', 'B']);
    assert.deepEqual(texts.translationTexts, ['А', 'Б']);
    assert.equal(texts.paragraphCount, 2);
  });

  it('computeCriticInputStats aggregates glossary and text sizes', () => {
    const chapter = makeChapter();
    const stats = computeCriticInputStats(chapter, 'term: gloss');
    assert.equal(stats.paragraphCount, 1);
    assert.equal(stats.glossaryChars, 'term: gloss'.length);
    assert.equal(stats.tooLarge, false);
  });

  it('computeCriticContentFingerprint is stable for same translated text', () => {
    const paragraphs = [
      { id: 'p1', index: 0, originalText: 'A', translatedText: 'А', status: 'translated' as const },
      { id: 'p2', index: 1, originalText: 'B', translatedText: 'Б', status: 'translated' as const },
    ];
    const first = computeCriticContentFingerprint(paragraphs);
    const second = computeCriticContentFingerprint([...paragraphs].reverse());
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]+$/);
  });
});

describe('runChapterCritic', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns critic report on successful LLM response', async () => {
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    mockCompleteStructuredJSON.mockResolvedValue({
      data: {
        summary: 'Good flow',
        strengths: 'Natural dialogue',
        issues: [
          {
            paragraphIndex: 0,
            dimension: 'accuracy',
            severity: 'MINOR',
            description: 'Minor wording',
          },
        ],
      },
      tokensUsed: { total: 42 },
    });

    const report = await runChapterCritic(makeProject(), makeChapter());
    assert.equal(report.summary, 'Good flow');
    assert.equal(report.strengths, 'Natural dialogue');
    assert.equal(report.issues.length, 1);
    assert.equal(report.tokensUsed, 42);
    assert.equal(report.model, 'gpt-4.1-mini');
    assert.equal(report.paragraphCount, 1);
    assert.match(report.contentFingerprint, /^[a-f0-9]+$/);
  });

  it('throws CriticNoTranslationError when chapter has no translated text', async () => {
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    const chapter = makeChapter({
      paragraphs: [
        { id: 'p1', index: 0, originalText: 'Hello.', translatedText: '', status: 'pending' },
      ],
    });

    await assert.rejects(
      () => runChapterCritic(makeProject(), chapter),
      (err: unknown) => err instanceof CriticNoTranslationError
    );
  });

  it('throws CriticInputTooLargeError when input exceeds limit', async () => {
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    const huge = 'x'.repeat(CRITIC_MAX_INPUT_CHARS);
    const chapter = makeChapter({
      paragraphs: [
        { id: 'p1', index: 0, originalText: huge, translatedText: huge, status: 'translated' },
      ],
    });

    await assert.rejects(
      () => runChapterCritic(makeProject(), chapter),
      (err: unknown) => err instanceof CriticInputTooLargeError
    );
  });

  it('throws CriticChapterTooLongError above paragraph threshold', async () => {
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    const paragraphs = Array.from({ length: CRITIC_CHUNKED_PARAGRAPH_THRESHOLD + 1 }, (_, i) => ({
      id: `p${i}`,
      index: i,
      originalText: 'a',
      translatedText: 'b',
      status: 'translated' as const,
    }));

    await assert.rejects(
      () => runChapterCritic(makeProject(), makeChapter({ paragraphs })),
      (err: unknown) => err instanceof CriticChapterTooLongError
    );
  });

  it('maps truncated LLM output to CriticOutputTruncatedError', async () => {
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    mockCompleteStructuredJSON.mockRejectedValue(new Error('truncated at max_tokens'));

    await assert.rejects(
      () => runChapterCritic(makeProject(), makeChapter()),
      (err: unknown) => err instanceof CriticOutputTruncatedError
    );
  });
});
