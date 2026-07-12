import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockRpc, mockGetChapter } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockGetChapter: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

vi.mock('./chapters.js', () => ({
  getChapter: (...args: unknown[]) => mockGetChapter(...args),
}));

import {
  bulkUpdateParagraphs,
  loadParagraphsForAiReplace,
  searchParagraphsInProject,
  updateParagraph,
} from './paragraphs.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of ['select', 'eq', 'update', 'single', 'in']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('updateParagraph', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when chapter is not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await updateParagraph(
      'proj-1',
      'ch-1',
      'p-1',
      { translatedText: 'Hi' },
      'token'
    );
    assert.equal(result, undefined);
  });

  it('returns undefined when paragraph is not found', async () => {
    const chapterChain = chainable({ data: { id: 'ch-1' }, error: null });
    const paragraphChain = chainable({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    let calls = 0;
    mockFrom.mockImplementation((table: string) => {
      calls += 1;
      if (table === 'chapters' && calls === 1) return chapterChain;
      if (table === 'paragraphs') return paragraphChain;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await updateParagraph(
      'proj-1',
      'ch-1',
      'missing',
      { translatedText: 'Hi' },
      'token'
    );
    assert.equal(result, undefined);
  });

  it('updates paragraph and syncs chapter translated text', async () => {
    const chapterLookupChain = chainable({ data: { id: 'ch-1' }, error: null });
    const paragraphUpdateChain = chainable({
      data: {
        id: 'p-1',
        index: 0,
        original_text: 'Hello',
        translated_text: 'Привет',
        status: 'edited',
      },
      error: null,
    });
    const chapterSyncChain = chainable({ data: null, error: null });
    const projectChain = chainable({ data: null, error: null });
    let chapterCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        chapterCalls += 1;
        return chapterCalls === 1 ? chapterLookupChain : chapterSyncChain;
      }
      if (table === 'paragraphs') return paragraphUpdateChain;
      if (table === 'projects') return projectChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockGetChapter.mockResolvedValue({
      id: 'ch-1',
      paragraphs: [
        { id: 'p-1', index: 0, originalText: 'Hello', translatedText: 'Привет', status: 'edited' },
      ],
    });

    const result = await updateParagraph(
      'proj-1',
      'ch-1',
      'p-1',
      { translatedText: 'Привет' },
      'token'
    );

    assert.equal(result?.id, 'p-1');
    assert.equal(mockGetChapter.mock.calls.length, 1);
    assert.equal(chapterSyncChain.update.mock.calls.length, 1);
    assert.equal(projectChain.update.mock.calls.length, 1);
  });
});

describe('loadParagraphsForAiReplace', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty refs without DB calls', async () => {
    const result = await loadParagraphsForAiReplace('proj-1', [], 'token');
    assert.deepEqual(result, []);
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('loads matching paragraphs for project', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            id: 'p-1',
            index: 2,
            translated_text: 'Translated',
            chapter_id: 'ch-1',
            chapters: { number: 1, title: 'Start', project_id: 'proj-1' },
          },
        ],
        error: null,
      })
    );

    const result = await loadParagraphsForAiReplace(
      'proj-1',
      [{ chapterId: 'ch-1', paragraphId: 'p-1' }],
      'token'
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]?.paragraphIndex, 2);
    assert.equal(result[0]?.chapterTitle, 'Start');
  });

  it('throws when load query fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'load failed' },
      })
    );

    await assert.rejects(
      () =>
        loadParagraphsForAiReplace('proj-1', [{ chapterId: 'ch-1', paragraphId: 'p-1' }], 'token'),
      /Failed to load paragraphs/
    );
  });
});

describe('bulkUpdateParagraphs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result for empty updates without DB calls', async () => {
    const result = await bulkUpdateParagraphs('proj-1', [], 'token');
    assert.deepEqual(result, { succeeded: [], failed: [] });
    assert.equal(mockFrom.mock.calls.length, 0);
  });

  it('marks paragraphs failed when chapter is not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const result = await bulkUpdateParagraphs(
      'proj-1',
      [{ chapterId: 'missing', paragraphId: 'p-1', translatedText: 'Text' }],
      'token'
    );

    assert.deepEqual(result.succeeded, []);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0]?.error, 'Chapter not found');
  });

  it('records partial failures when paragraph update errors', async () => {
    const chapterChain = chainable({ data: { id: 'ch-1' }, error: null });
    const okChain = chainable({ data: null, error: null });
    const failChain = chainable({ data: null, error: { message: 'update blocked' } });
    const projectChain = chainable({ data: null, error: null });
    let paragraphCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') return chapterChain;
      if (table === 'projects') return projectChain;
      if (table === 'paragraphs') {
        paragraphCalls += 1;
        return paragraphCalls === 1 ? okChain : failChain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockGetChapter.mockResolvedValue(undefined);

    const result = await bulkUpdateParagraphs(
      'proj-1',
      [
        { chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'One' },
        { chapterId: 'ch-1', paragraphId: 'p-2', translatedText: 'Two' },
      ],
      'token'
    );

    assert.deepEqual(result.succeeded, ['p-1']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0]?.paragraphId, 'p-2');
  });

  it('syncs chapter text and bumps project when updates succeed', async () => {
    const chapterLookupChain = chainable({ data: { id: 'ch-1' }, error: null });
    const paragraphChain = chainable({ data: null, error: null });
    const chapterSyncChain = chainable({ data: null, error: null });
    const projectChain = chainable({ data: null, error: null });
    let chapterCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        chapterCalls += 1;
        return chapterCalls === 1 ? chapterLookupChain : chapterSyncChain;
      }
      if (table === 'paragraphs') return paragraphChain;
      if (table === 'projects') return projectChain;
      throw new Error(`unexpected table ${table}`);
    });
    mockGetChapter.mockResolvedValue({
      id: 'ch-1',
      paragraphs: [
        { id: 'p-1', index: 0, originalText: 'Hello', translatedText: 'Updated', status: 'edited' },
      ],
    });

    const result = await bulkUpdateParagraphs(
      'proj-1',
      [{ chapterId: 'ch-1', paragraphId: 'p-1', translatedText: 'Updated' }],
      'token'
    );

    assert.deepEqual(result.succeeded, ['p-1']);
    assert.deepEqual(result.failed, []);
    assert.equal(mockGetChapter.mock.calls.length, 1);
    assert.equal(projectChain.update.mock.calls.length, 1);
  });
});

describe('searchParagraphsInProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result for blank query', async () => {
    const result = await searchParagraphsInProject('proj-1', '   ', 'both', 'token');
    assert.deepEqual(result, { matches: [], total: 0, hasMore: false });
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('maps RPC rows to search matches', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          chapter_id: 'ch-1',
          chapter_number: 1,
          chapter_title: 'Start',
          chapter_translated_title: null,
          paragraph_id: 'p-1',
          paragraph_index: 0,
          match_field: 'original',
          original_text: 'Hello world',
          translated_text: null,
        },
      ],
      error: null,
    });

    const result = await searchParagraphsInProject('proj-1', 'world', 'original', 'token', {
      limit: 10,
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.chapterNumber, 1);
    assert.equal(result.matches[0]?.paragraphIndex, 1);
    assert.ok(mockRpc.mock.calls[0]?.[0] === 'search_paragraphs_in_project');
  });

  it('filters whole-word matches from broader RPC results', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          chapter_id: 'ch-1',
          chapter_number: 1,
          chapter_title: 'Start',
          chapter_translated_title: null,
          paragraph_id: 'p-1',
          paragraph_index: 0,
          match_field: 'original',
          original_text: 'Hello worldwide',
          translated_text: null,
        },
        {
          chapter_id: 'ch-1',
          chapter_number: 1,
          chapter_title: 'Start',
          chapter_translated_title: null,
          paragraph_id: 'p-2',
          paragraph_index: 1,
          match_field: 'original',
          original_text: 'Hello world',
          translated_text: null,
        },
      ],
      error: null,
    });

    const result = await searchParagraphsInProject('proj-1', 'world', 'original', 'token', {
      wholeWord: true,
      limit: 10,
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.paragraphId, 'p-2');
    const rpcArgs = mockRpc.mock.calls[0]?.[1] as { p_limit: number };
    assert.equal(rpcArgs.p_limit, 30);
  });

  it('throws when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } });
    await assert.rejects(
      () => searchParagraphsInProject('proj-1', 'test', 'both', 'token'),
      /Search failed/
    );
  });
});
