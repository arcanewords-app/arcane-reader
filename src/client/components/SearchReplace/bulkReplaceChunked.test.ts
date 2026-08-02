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

  it('returns empty result without calling API when updates are empty', async () => {
    const { api } = await import('../../api/client.js');
    const result = await bulkReplaceParagraphsChunked('proj-1', []);
    expect(api.bulkUpdateParagraphs).not.toHaveBeenCalled();
    assert.deepEqual(result, { succeeded: [], failed: [] });
  });

  it('uses a single chunk when updates fit within CHUNK_SIZE', async () => {
    const { api } = await import('../../api/client.js');
    vi.mocked(api.bulkUpdateParagraphs).mockResolvedValueOnce({
      succeeded: ['p1'],
      failed: [],
    });

    const updates = [{ chapterId: 'ch-1', paragraphId: 'p1', translatedText: 'text' }];
    const result = await bulkReplaceParagraphsChunked('proj-1', updates);

    expect(api.bulkUpdateParagraphs).toHaveBeenCalledTimes(1);
    expect(api.bulkUpdateParagraphs).toHaveBeenCalledWith('proj-1', updates);
    assert.deepEqual(result, { succeeded: ['p1'], failed: [] });
  });

  it('works without onProgress callback', async () => {
    const { api } = await import('../../api/client.js');
    vi.mocked(api.bulkUpdateParagraphs).mockResolvedValueOnce({
      succeeded: ['p1'],
      failed: [],
    });

    const result = await bulkReplaceParagraphsChunked('proj-1', [
      { chapterId: 'ch-1', paragraphId: 'p1', translatedText: 'x' },
    ]);
    assert.deepEqual(result.succeeded, ['p1']);
  });

  it('splits exactly at CHUNK_SIZE boundary into two calls', async () => {
    const { api } = await import('../../api/client.js');
    vi.mocked(api.bulkUpdateParagraphs)
      .mockResolvedValueOnce({
        succeeded: Array.from({ length: 50 }, (_, i) => `p${i + 1}`),
        failed: [],
      })
      .mockResolvedValueOnce({ succeeded: ['p51'], failed: [] });

    const updates = Array.from({ length: 51 }, (_, i) => ({
      chapterId: 'ch-1',
      paragraphId: `p${i + 1}`,
      translatedText: 'text',
    }));

    await bulkReplaceParagraphsChunked('proj-1', updates);

    expect(api.bulkUpdateParagraphs).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.bulkUpdateParagraphs).mock.calls[0][1]).toHaveLength(50);
    expect(vi.mocked(api.bulkUpdateParagraphs).mock.calls[1][1]).toHaveLength(1);
  });
});
