import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import { searchParagraphsInProject } from './paragraphs.js';

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

  it('throws when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } });
    await assert.rejects(
      () => searchParagraphsInProject('proj-1', 'test', 'both', 'token'),
      /Search failed/
    );
  });
});
