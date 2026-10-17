import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({ from: mockFrom })),
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import { chapterHasTranslatingLock } from './editions.js';

function queryResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['select', 'eq', 'limit', 'maybeSingle']) {
    chain[method] = vi.fn(self);
  }
  chain.then = (resolve: (value: typeof result) => void, reject?: (reason: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('chapterHasTranslatingLock', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('locks when the primary chapter is translating', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return queryResult({ data: { status: 'translating' }, error: null });
      }
      return queryResult({ data: [], error: null });
    });

    assert.equal(await chapterHasTranslatingLock('ch-1', 'token'), true);
    assert.equal(
      mockFrom.mock.calls.some((call) => call[0] === 'chapter_editions'),
      false
    );
  });

  it('locks when the caller already knows the primary status is translating', async () => {
    mockFrom.mockReturnValue(queryResult({ data: { status: 'pending' }, error: null }));

    assert.equal(
      await chapterHasTranslatingLock('ch-1', 'token', { chapterStatus: 'translating' }),
      true
    );
  });

  it('locks when another edition row is translating', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return queryResult({ data: { status: 'pending' }, error: null });
      }
      return queryResult({ data: [{ status: 'translating' }], error: null });
    });

    assert.equal(await chapterHasTranslatingLock('ch-1', 'token'), true);
  });

  it('does not lock when the edition table is missing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return queryResult({ data: { status: 'pending' }, error: null });
      }
      return queryResult({
        data: null,
        error: { code: 'PGRST205', message: 'chapter_editions does not exist' },
      });
    });

    assert.equal(await chapterHasTranslatingLock('ch-1', 'token'), false);
  });
});
