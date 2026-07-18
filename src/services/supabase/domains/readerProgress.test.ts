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
  resetReadProgress,
  updateChapterStatus,
  updateReadProgress,
} from './readerProgress.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of [
    'select',
    'eq',
    'upsert',
    'delete',
    'maybeSingle',
    'update',
    'single',
    'order',
    'in',
    'not',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof result) => void) => resolve(result);
  return chain;
}

describe('getReadProgress', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero watermark for guest', async () => {
    const result = await getReadProgress('pub-1', null, null);
    assert.deepEqual(result, { lastReadChapterNumber: 0 });
  });

  it('maps stored watermark for authenticated user', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: { last_read_chapter_number: 7 },
        error: null,
      })
    );
    const result = await getReadProgress('pub-1', 'user-1', 'token');
    assert.equal(result.lastReadChapterNumber, 7);
  });

  it('returns zero when query errors', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: null,
        error: { message: 'query failed' },
      })
    );

    const result = await getReadProgress('pub-1', 'user-1', 'token');
    assert.deepEqual(result, { lastReadChapterNumber: 0 });
  });
});

describe('updateReadProgress', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('complete mode advances watermark with max', async () => {
    const selectChain = chainable({
      data: { last_read_chapter_number: 2 },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    const result = await updateReadProgress('user-1', 'pub-1', 5, 'complete', 'token');
    assert.equal(result.lastReadChapterNumber, 5);
    const payload = upsertChain.upsert.mock.calls[0]?.[0] as {
      last_read_chapter_number: number;
    };
    assert.equal(payload.last_read_chapter_number, 5);
  });

  it('complete mode does not decrease watermark', async () => {
    const selectChain = chainable({
      data: { last_read_chapter_number: 8 },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    const result = await updateReadProgress('user-1', 'pub-1', 3, 'complete', 'token');
    assert.equal(result.lastReadChapterNumber, 8);
  });

  it('set mode sets watermark explicitly', async () => {
    const selectChain = chainable({
      data: { last_read_chapter_number: 8 },
      error: null,
    });
    const upsertChain = chainable({ data: null, error: null });
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? selectChain : upsertChain;
    });

    const result = await updateReadProgress('user-1', 'pub-1', 3, 'set', 'token');
    assert.equal(result.lastReadChapterNumber, 3);
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
      () => updateReadProgress('user-1', 'pub-1', 1, 'complete', 'token'),
      /Failed to update read progress/
    );
  });
});

describe('resetReadProgress', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes progress row', async () => {
    const deleteChain = chainable({ data: null, error: null });
    mockFrom.mockReturnValue(deleteChain);

    await resetReadProgress('user-1', 'pub-1', 'token');
    assert.equal(deleteChain.delete.mock.calls.length, 1);
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
});

describe('getUserReadingHistory', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns published publications with chapter counts', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            last_read_chapter_number: 5,
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
    let serviceFromCall = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceFromCall += 1;
      if (serviceFromCall === 1) {
        return chainable({
          data: [
            { project_id: 'proj-1', id: 'ch-1', number: 1 },
            { project_id: 'proj-1', id: 'ch-2', number: 2 },
            { project_id: 'proj-1', id: 'ch-5', number: 5 },
          ],
          error: null,
        });
      }
      return chainable({
        data: [{ id: 'ch-1' }, { id: 'ch-2' }, { id: 'ch-5' }],
        error: null,
      });
    });

    const history = await getUserReadingHistory('user-1', 'token');
    assert.equal(history.length, 1);
    assert.equal(history[0]?.lastReadChapterNumber, 5);
    assert.equal(history[0]?.readCount, 3);
    assert.equal(history[0]?.totalChapters, 12);
    assert.equal(history[0]?.continueChapterId, null);
  });

  it('continueChapterId skips untranslated chapters', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            last_read_chapter_number: 1,
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
      data: [{ project_id: 'proj-1', total_count: 3 }],
      error: null,
    });
    let serviceFromCall = 0;
    mockServiceFrom.mockImplementation(() => {
      serviceFromCall += 1;
      if (serviceFromCall === 1) {
        return chainable({
          data: [
            { project_id: 'proj-1', id: 'ch-1', number: 1 },
            { project_id: 'proj-1', id: 'ch-2', number: 2 },
            { project_id: 'proj-1', id: 'ch-3', number: 3 },
          ],
          error: null,
        });
      }
      return chainable({
        data: [{ id: 'ch-1' }, { id: 'ch-3' }],
        error: null,
      });
    });

    const history = await getUserReadingHistory('user-1', 'token');
    assert.equal(history[0]?.continueChapterId, 'ch-3');
  });

  it('filters out zero watermark rows', async () => {
    mockFrom.mockReturnValue(
      chainable({
        data: [
          {
            publication_id: 'pub-1',
            last_read_chapter_number: 0,
            last_read_at: null,
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

    const history = await getUserReadingHistory('user-1', 'token');
    assert.deepEqual(history, []);
  });
});
