import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { Project } from '../storage/database.js';
import {
  AiReplaceInputTooLargeError,
  AiReplaceNoChangesError,
  AiReplaceOutputInvalidError,
  AiReplaceTooManyError,
  runProjectAiReplace,
} from './project-ai-replace.js';
import {
  AI_REPLACE_MAX_INPUT_CHARS,
  AI_REPLACE_MAX_PARAGRAPHS,
} from '../shared/aiReplacePresets.js';

const emptyGlossary = {
  novelId: 'proj-1',
  version: 1,
  lastUpdated: new Date(),
  characters: [],
  locations: [],
  terms: [],
};

const { mockLoadParagraphsForAiReplace, mockCompleteStructuredJSON, mockGetAgentForProject } =
  vi.hoisted(() => ({
    mockLoadParagraphsForAiReplace: vi.fn(),
    mockCompleteStructuredJSON: vi.fn(),
    mockGetAgentForProject: vi.fn(),
  }));

vi.mock('../config.js', () => ({
  loadConfig: () => ({
    openai: { apiKey: 'test-key', model: 'gpt-4.1-mini' },
  }),
}));

vi.mock('./supabaseDatabase.js', () => ({
  loadParagraphsForAiReplace: (...args: unknown[]) => mockLoadParagraphsForAiReplace(...args),
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

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Test',
    type: 'text',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapters: [],
    glossary: [],
    settings: {} as Project['settings'],
    createdAt: '',
    updatedAt: '',
  };
}

describe('runProjectAiReplace', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws AiReplaceNoChangesError when paragraph list is empty', async () => {
    await assert.rejects(
      () =>
        runProjectAiReplace(
          makeProject(),
          { find: 'test', preset: 'minimal_fix', paragraphs: [] },
          'token'
        ),
      (err: unknown) => err instanceof AiReplaceNoChangesError
    );
  });

  it('throws AiReplaceTooManyError when paragraph count exceeds limit', async () => {
    const paragraphs = Array.from({ length: AI_REPLACE_MAX_PARAGRAPHS + 1 }, (_, i) => ({
      chapterId: 'ch-1',
      paragraphId: `p-${i}`,
    }));

    await assert.rejects(
      () =>
        runProjectAiReplace(
          makeProject(),
          { find: 'test', preset: 'minimal_fix', paragraphs },
          'token'
        ),
      (err: unknown) => err instanceof AiReplaceTooManyError
    );
  });

  it('throws AiReplaceInputTooLargeError when loaded text is too large', async () => {
    mockLoadParagraphsForAiReplace.mockResolvedValue([
      {
        chapterId: 'ch-1',
        chapterNumber: 1,
        chapterTitle: 'Ch1',
        paragraphId: 'p-1',
        paragraphIndex: 0,
        translatedText: 'x'.repeat(AI_REPLACE_MAX_INPUT_CHARS + 1),
      },
    ]);

    await assert.rejects(
      () =>
        runProjectAiReplace(
          makeProject(),
          {
            find: 'test',
            preset: 'minimal_fix',
            paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
          },
          'token'
        ),
      (err: unknown) => err instanceof AiReplaceInputTooLargeError
    );
  });

  it('returns replace items when LLM suggests minimal edits', async () => {
    mockLoadParagraphsForAiReplace.mockResolvedValue([
      {
        chapterId: 'ch-1',
        chapterNumber: 1,
        chapterTitle: 'Ch1',
        paragraphId: 'p-1',
        paragraphIndex: 0,
        translatedText: 'Old name walked in.',
      },
    ]);
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    mockCompleteStructuredJSON.mockResolvedValue({
      data: {
        paragraphs: [{ id: 'p-1', text: 'New name walked in.' }],
      },
      tokensUsed: { total: 15 },
    });

    const result = await runProjectAiReplace(
      makeProject(),
      {
        find: 'Old name',
        replaceHint: 'New name',
        preset: 'name_declension',
        paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
      },
      'token'
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.before, 'Old name walked in.');
    assert.equal(result.items[0]?.after, 'New name walked in.');
    assert.equal(result.tokensUsed, 15);
    assert.equal(result.model, 'gpt-4.1-mini');
    assert.equal(result.batches, 1);
  });

  it('throws AiReplaceNoChangesError when model returns identical text', async () => {
    mockLoadParagraphsForAiReplace.mockResolvedValue([
      {
        chapterId: 'ch-1',
        chapterNumber: 1,
        chapterTitle: 'Ch1',
        paragraphId: 'p-1',
        paragraphIndex: 0,
        translatedText: 'Same text.',
      },
    ]);
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    mockCompleteStructuredJSON.mockResolvedValue({
      data: { paragraphs: [{ id: 'p-1', text: 'Same text.' }] },
      tokensUsed: { total: 5 },
    });

    await assert.rejects(
      () =>
        runProjectAiReplace(
          makeProject(),
          {
            find: 'Same',
            preset: 'minimal_fix',
            paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
          },
          'token'
        ),
      (err: unknown) => err instanceof AiReplaceNoChangesError
    );
  });

  it('throws AiReplaceOutputInvalidError for unknown paragraph id from model', async () => {
    mockLoadParagraphsForAiReplace.mockResolvedValue([
      {
        chapterId: 'ch-1',
        chapterNumber: 1,
        chapterTitle: 'Ch1',
        paragraphId: 'p-1',
        paragraphIndex: 0,
        translatedText: 'Text one.',
      },
    ]);
    mockGetAgentForProject.mockResolvedValue({ glossary: emptyGlossary });
    mockCompleteStructuredJSON.mockResolvedValue({
      data: { paragraphs: [{ id: 'p-unknown', text: 'Changed.' }] },
      tokensUsed: { total: 5 },
    });

    await assert.rejects(
      () =>
        runProjectAiReplace(
          makeProject(),
          {
            find: 'Text',
            preset: 'minimal_fix',
            paragraphs: [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
          },
          'token'
        ),
      (err: unknown) => err instanceof AiReplaceOutputInvalidError
    );
  });
});
