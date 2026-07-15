import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom, mockServiceFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
  createServiceRoleClient: vi.fn(() => ({
    from: mockServiceFrom,
    rpc: mockRpc,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import {
  getReadProgress,
  getUserReadingHistory,
  markChapterAsRead,
  updateChapterStatus,
  updateReadingPosition,
} from './readerProgress.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of ['select', 'eq', 'upsert', 'maybeSingle', 'update', 'single', 'order']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('getReadProgress', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty progress for guest', async () => {
    const result = await getReadProgress('pub-1', null, null);
    assert.deepEqual(result, {
      chapterIds: [],
      lastReadChapterId: null,
      lastReadParagraphIndex: 0,
    });
  });

  it('maps stored progress for authenticated user', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          read_chapter_ids: ['ch-1', 'ch-2'],
          last_read_chapter_id: 'ch-2',
          last_read_paragraph_index: 4,
        },
        error: null,
      })
    );
    const result = await getReadProgress('pub-1', 'user-1', 'token');
    assert.deepEqual(result.chapterIds, ['ch-1', 'ch-2']);
    assert.equal(result.lastReadChapterId, 'ch-2');
    assert.equal(result.lastReadParagraphIndex, 4);
  });

  it('returns empty progress when query errors', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'query failed' },
      })
    );

    const result = await getReadProgress('pub-1', 'user-1', 'token');
    assert.deepEqual(result, {
      chapterIds: [],
      lastReadChapterId: null,
      lastReadParagraphIndex: 0,
    });
  });
});

describe('markChapterAsRead', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('upserts progress with new chapter id', async () => {
    const selectChain = chainable({
      data: { read_chapter_ids: ['ch-1'] },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await markChapterAsRead('user-1', 'pub-1', 'ch-2', 'token');
    assert.equal(upsertChain.upsert.mock.calls.length, 1);
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as {
      read_chapter_ids: string[];
    };
    assert.deepEqual(payload.read_chapter_ids, ['ch-1', 'ch-2']);
  });

  it('does not overwrite reading position fields on upsert', async () => {
    const selectChain = chainable({
      data: { read_chapter_ids: ['ch-1'] },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await markChapterAsRead('user-1', 'pub-1', 'ch-2', 'token');
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    assert.equal('last_read_chapter_id' in payload, false);
    assert.equal('last_read_paragraph_index' in payload, false);
  });

  it('does not duplicate chapter id when already read', async () => {
    const selectChain = chainable({
      data: { read_chapter_ids: ['ch-1', 'ch-2'] },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await markChapterAsRead('user-1', 'pub-1', 'ch-2', 'token');
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as {
      read_chapter_ids: string[];
    };
    assert.deepEqual(payload.read_chapter_ids, ['ch-1', 'ch-2']);
  });

  it('throws when upsert fails', async () => {
    const selectChain = chainable({
      data: { read_chapter_ids: [] },
      error: null,
    });
    const upsertChain = chainable({
      data: null,
      error: { message: 'upsert failed' },
    });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await assert.rejects(
      () => markChapterAsRead('user-1', 'pub-1', 'ch-1', 'token'),
      /Failed to mark chapter as read/
    );
  });
});

describe('updateReadingPosition', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('upserts position when no existing progress', async () => {
    const selectChain = chainable({ data: null, error: null });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await updateReadingPosition('user-1', 'pub-1', 'ch-1', 3, 'token');
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as {
      last_read_chapter_id: string;
      last_read_paragraph_index: number;
      read_chapter_ids: string[];
    };
    assert.equal(payload.last_read_chapter_id, 'ch-1');
    assert.equal(payload.last_read_paragraph_index, 3);
    assert.deepEqual(payload.read_chapter_ids, []);
  });

  it('preserves read chapter ids from existing progress', async () => {
    const selectChain = chainable({
      data: { read_chapter_ids: ['ch-1', 'ch-2'] },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await updateReadingPosition('user-1', 'pub-1', 'ch-2', 7, 'token');
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as {
      read_chapter_ids: string[];
      last_read_paragraph_index: number;
    };
    assert.deepEqual(payload.read_chapter_ids, ['ch-1', 'ch-2']);
    assert.equal(payload.last_read_paragraph_index, 7);
  });

  it('throws when upsert fails', async () => {
    const selectChain = chainable({ data: null, error: null });
    const upsertChain = chainable({
      data: null,
      error: { message: 'upsert failed' },
    });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    await assert.rejects(
      () => updateReadingPosition('user-1', 'pub-1', 'ch-1', 0, 'token'),
      /Failed to update reading position/
    );
  });
});

describe('updateChapterStatus', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns transformed chapter when update succeeds', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: {
          id: 'ch-1',
          project_id: 'proj-1',
          number: 1,
          title: 'Chapter 1',
          status: 'completed',
          original_text: '',
          translated_text: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        error: null,
      })
    );

    const chapter = await updateChapterStatus('proj-1', 'ch-1', 'completed', 'token');
    assert.equal(chapter?.id, 'ch-1');
    assert.equal(chapter?.status, 'completed');
  });

  it('returns undefined when chapter is not found', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
    );

    const chapter = await updateChapterStatus('proj-1', 'missing', 'completed', 'token');
    assert.equal(chapter, undefined);
  });

  it('throws on unexpected update error', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { code: 'XX000', message: 'update failed' },
      })
    );

    await assert.rejects(
      () => updateChapterStatus('proj-1', 'ch-1', 'completed', 'token'),
      /Failed to update chapter status/
    );
  });
});

describe('getUserReadingHistory', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when user has no progress', async () => {
    mockFrom.mockReturnValue(chainable({ data: [], error: null }));

    const history = await getUserReadingHistory('user-1', 'token');
    assert.deepEqual(history, []);
  });

  it('returns published publications with chapter counts', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            read_chapter_ids: ['ch-1', 'ch-2'],
            last_read_chapter_id: 'ch-2',
            last_read_at: '2026-07-01T00:00:00Z',
            publications: {
              id: 'pub-1',
              title: 'Novel',
              cover_image_url: 'http://cover.png',
              slug: 'novel',
              project_id: 'proj-1',
              status: 'published',
            },
          },
        ],
        error: null,
      })
    );
    mockRpc.mockResolvedValue({
      data: [{ project_id: 'proj-1', total_count: 12 }],
      error: null,
    });

    const history = await getUserReadingHistory('user-1', 'token');
    assert.equal(history.length, 1);
    assert.equal(history[0]?.title, 'Novel');
    assert.equal(history[0]?.readCount, 2);
    assert.equal(history[0]?.totalChapters, 12);
  });

  it('filters out unpublished publications', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            read_chapter_ids: ['ch-1'],
            last_read_chapter_id: 'ch-1',
            last_read_at: '2026-07-01T00:00:00Z',
            publications: {
              id: 'pub-1',
              title: 'Draft Novel',
              cover_image_url: null,
              slug: null,
              project_id: 'proj-1',
              status: 'draft',
            },
          },
        ],
        error: null,
      })
    );

    const history = await getUserReadingHistory('user-1', 'token');
    assert.deepEqual(history, []);
  });

  it('returns empty array when progress query errors', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'history failed' },
      })
    );

    const history = await getUserReadingHistory('user-1', 'token');
    assert.deepEqual(history, []);
  });

  it('uses zero chapter counts when rpc fallback fails', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            read_chapter_ids: ['ch-1'],
            last_read_chapter_id: 'ch-1',
            last_read_at: '2026-07-01T00:00:00Z',
            publications: {
              id: 'pub-1',
              title: 'Novel',
              cover_image_url: null,
              slug: 'novel',
              project_id: 'proj-1',
              status: 'published',
            },
          },
        ],
        error: null,
      })
    );
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc missing' },
    });

    const history = await getUserReadingHistory('user-1', 'token');
    assert.equal(history[0]?.totalChapters, 0);
  });
});
