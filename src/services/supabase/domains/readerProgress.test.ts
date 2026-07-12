import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import { getReadProgress, markChapterAsRead } from './readerProgress.js';

type ChainMethod = ReturnType<typeof vi.fn>;

function chainable(result: { data: unknown; error: unknown }) {
  const chain = {} as Record<string, ChainMethod> & {
    then: (resolve: (v: typeof result) => void) => void;
  };
  for (const m of ['select', 'eq', 'upsert', 'maybeSingle']) {
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
  });
});
