import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../supabaseClient.js', () => ({
  createClientWithToken: vi.fn(() => ({
    rpc: mockRpc,
  })),
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

vi.mock('../../../utils/tokenValidation.js', () => ({
  validateToken: vi.fn(),
}));

import { importChaptersBatch } from './chapters.js';

describe('importChaptersBatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty input', async () => {
    const result = await importChaptersBatch('proj-1', [], 'token');
    assert.deepEqual(result, []);
    assert.equal(mockRpc.mock.calls.length, 0);
  });

  it('maps RPC import_chapters_batch response', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          source_index: 0,
          chapter_id: 'ch-new',
          number: 1,
          title: 'Chapter 1',
          paragraphs_count: 3,
        },
      ],
      error: null,
    });

    const result = await importChaptersBatch(
      'proj-1',
      [{ title: 'Chapter 1', originalText: 'Para one.\n\nPara two.' }],
      'token'
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]?.chapterId, 'ch-new');
    assert.equal(result[0]?.paragraphsCount, 3);
    assert.equal(mockRpc.mock.calls[0]?.[0], 'import_chapters_batch');
  });
});
