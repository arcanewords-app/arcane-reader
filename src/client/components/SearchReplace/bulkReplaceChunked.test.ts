import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkReplaceParagraphsChunked } from './bulkReplaceChunked.js';

vi.mock('../../api/client.js', () => ({
  api: {
    bulkUpdateParagraphs: vi.fn(),
  },
}));

describe('bulkReplaceChunked', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('chunks updates and aggregates succeeded/failed', async () => {
    const { api } = await import('../../api/client.js');
    vi.mocked(api.bulkUpdateParagraphs)
      .mockResolvedValueOnce({ succeeded: ['p1'], failed: [] })
      .mockResolvedValueOnce({ succeeded: ['p2'], failed: [{ paragraphId: 'p3', error: 'x' }] });

    const updates = Array.from({ length: 51 }, (_, i) => ({
      chapterId: 'ch-1',
      paragraphId: `p${i + 1}`,
      translatedText: 'text',
    }));

    const progress: number[] = [];
    const result = await bulkReplaceParagraphsChunked('proj-1', updates, (p) =>
      progress.push(p.done)
    );

    expect(api.bulkUpdateParagraphs).toHaveBeenCalledTimes(2);
    assert.deepEqual(result.succeeded, ['p1', 'p2']);
    assert.equal(result.failed.length, 1);
    expect(progress).toContain(50);
    expect(progress).toContain(51);
  });
});
