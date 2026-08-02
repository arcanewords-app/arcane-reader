import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getChapterStatus = vi.fn();

vi.mock('../api/client.js', () => ({
  api: {
    getChapterStatus: (...args: unknown[]) => getChapterStatus(...args),
  },
}));

import { MAX_POLL_ATTEMPTS, pollChapterUntilDone } from './batchTranslationPoll.js';

const t = (key: string) => key;

describe('pollChapterUntilDone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getChapterStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns success when status is completed', async () => {
    getChapterStatus.mockResolvedValue({ status: 'completed' });
    const promise = pollChapterUntilDone('p1', 'ch-1', () => false, t);
    await expect(promise).resolves.toEqual({ success: true });
  });

  it('returns partial success when status is partial', async () => {
    getChapterStatus.mockResolvedValue({ status: 'partial' });
    await expect(pollChapterUntilDone('p1', 'ch-1', () => false, t)).resolves.toEqual({
      success: true,
      partial: true,
    });
  });

  it('returns cancelled when isCancelled is true before poll', async () => {
    await expect(pollChapterUntilDone('p1', 'ch-1', () => true, t)).resolves.toEqual({
      success: false,
      cancelled: true,
      error: 'projectInfo.errorCanceled',
    });
    expect(getChapterStatus).not.toHaveBeenCalled();
  });

  it('returns translation error when status is error', async () => {
    getChapterStatus.mockResolvedValue({ status: 'error' });
    await expect(pollChapterUntilDone('p1', 'ch-1', () => false, t)).resolves.toEqual({
      success: false,
      error: 'projectInfo.errorTranslation',
    });
  });

  it('returns status-check error when getChapterStatus throws', async () => {
    getChapterStatus.mockRejectedValue(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(pollChapterUntilDone('p1', 'ch-1', () => false, t)).resolves.toEqual({
      success: false,
      error: 'projectInfo.errorStatusCheck',
    });
    consoleSpy.mockRestore();
  });

  it('polls again while translating then completes', async () => {
    getChapterStatus
      .mockResolvedValueOnce({ status: 'translating' })
      .mockResolvedValueOnce({ status: 'completed' });

    const promise = pollChapterUntilDone('p1', 'ch-1', () => false, t);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).resolves.toEqual({ success: true });
    expect(getChapterStatus).toHaveBeenCalledTimes(2);
  });

  it('times out after max attempts still translating', async () => {
    getChapterStatus.mockResolvedValue({ status: 'translating' });

    const promise = pollChapterUntilDone('p1', 'ch-1', () => false, t);
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(12_000);
    }
    await expect(promise).resolves.toEqual({
      success: false,
      error: 'projectInfo.errorTimeout',
    });
  });
});
