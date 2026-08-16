/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJobBasedUploadFormat } from './chapterUploadQueueUtils.js';
import {
  PARALLEL_LIMIT,
  buildUploadErrorDetails,
  canStartMoreUploads,
  cancelPendingQueueItems,
  extractUploadResultWarnings,
  findNextPendingItem,
  generateQueueItemId,
  importJobSnapshot,
  isAbortUploadError,
  isSupportedUploadFilename,
  markItemRetryPending,
  markItemUploading,
  nextImportPollDelay,
  normalizeUploadTitle,
  patchQueueItemById,
  pendingQueueItemIds,
  removeQueueItemById,
  uploadPhaseFromProgress,
} from './chapterUploadQueueCore.js';

const startImportJob = vi.fn();
const getImportJob = vi.fn();
const cancelImportJob = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { number?: number }) =>
      opts?.number != null ? `${key}:${opts.number}` : key,
  }),
}));

vi.mock('../../api/client.js', () => ({
  api: {
    startImportJob: (...args: unknown[]) => startImportJob(...args),
    getImportJob: (...args: unknown[]) => getImportJob(...args),
    cancelImportJob: (...args: unknown[]) => cancelImportJob(...args),
  },
}));

import { useChapterUploadQueue } from './useChapterUploadQueue.js';

describe('isJobBasedUploadFormat', () => {
  it('returns true for epub, fb2, and csv', () => {
    expect(isJobBasedUploadFormat('book.epub')).toBe(true);
    expect(isJobBasedUploadFormat('BOOK.FB2')).toBe(true);
    expect(isJobBasedUploadFormat('chapters.csv')).toBe(true);
  });

  it('returns false for txt and other extensions', () => {
    expect(isJobBasedUploadFormat('chapter.txt')).toBe(false);
    expect(isJobBasedUploadFormat('notes.md')).toBe(false);
    expect(isJobBasedUploadFormat('archive.zip')).toBe(false);
  });
});

describe('chapterUploadQueueCore', () => {
  it('generateQueueItemId is stable for fixed inputs', () => {
    expect(generateQueueItemId(1_700_000_000_000, 0.5)).toMatch(/^[a-z0-9]+-\d+$/);
  });

  it('uploadPhaseFromProgress switches to processing when complete', () => {
    expect(uploadPhaseFromProgress(0, 100)).toBe('sending');
    expect(uploadPhaseFromProgress(50, 100)).toBe('sending');
    expect(uploadPhaseFromProgress(100, 100)).toBe('processing');
    expect(uploadPhaseFromProgress(10, 0)).toBe('sending');
  });

  it('nextImportPollDelay resets on change and backs off otherwise', () => {
    expect(nextImportPollDelay(3000, true)).toBe(1500);
    expect(nextImportPollDelay(1500, false)).toBe(2250);
    expect(nextImportPollDelay(7000, false)).toBe(8000);
  });

  it('importJobSnapshot encodes status fields', () => {
    expect(
      importJobSnapshot({
        status: 'processing',
        phase: 'parse',
        current: 2,
        total: 10,
        currentChapterTitle: 'Ch',
      })
    ).toBe('processing|parse|2|10|Ch');
    expect(
      importJobSnapshot({ status: 'completed', phase: null, current: null, total: null })
    ).toBe('completed|null|null|null|');
  });

  it('patch/remove/cancel queue helpers', () => {
    const q = [
      { id: 'a', status: 'pending' as const, retries: 0 },
      { id: 'b', status: 'uploading' as const, retries: 1 },
    ];
    expect(patchQueueItemById(q, 'a', { status: 'error' as const })[0].status).toBe('error');
    expect(removeQueueItemById(q, 'a')).toEqual([q[1]]);
    expect(cancelPendingQueueItems(q).map((i) => i.status)).toEqual(['canceled', 'uploading']);
    expect(pendingQueueItemIds(q)).toEqual(['a']);
    expect(findNextPendingItem(q)?.id).toBe('a');
  });

  it('canStartMoreUploads respects parallel limit', () => {
    expect(canStartMoreUploads(0)).toBe(true);
    expect(canStartMoreUploads(PARALLEL_LIMIT - 1)).toBe(true);
    expect(canStartMoreUploads(PARALLEL_LIMIT)).toBe(false);
  });

  it('isSupportedUploadFilename and normalizeUploadTitle', () => {
    expect(isSupportedUploadFilename('a.txt')).toBe(true);
    expect(isSupportedUploadFilename('a.docx')).toBe(false);
    expect(normalizeUploadTitle('01_Prologue.txt', 'Fallback')).toBe('Prologue');
    expect(normalizeUploadTitle('001.txt', 'Fallback')).toBe('Fallback');
  });

  it('buildUploadErrorDetails concatenates sections', () => {
    const text = buildUploadErrorDetails({
      itemLabel: 'File: a.txt',
      message: 'boom',
      errorDetails: 'detail',
      parseErrors: ['bad', 'worse'],
    });
    expect(text).toContain('File: a.txt');
    expect(text).toContain('boom');
    expect(text).toContain('detail');
    expect(text).toContain('1. bad');
    expect(text).toContain('2. worse');
  });

  it('isAbortUploadError and extractUploadResultWarnings', () => {
    expect(isAbortUploadError({ name: 'AbortError' })).toBe(true);
    expect(isAbortUploadError({ message: 'Request aborted' })).toBe(true);
    expect(isAbortUploadError({ message: 'other' })).toBe(false);
    expect(extractUploadResultWarnings({ warnings: ['w'] })).toEqual(['w']);
    expect(extractUploadResultWarnings({})).toBeUndefined();
    expect(extractUploadResultWarnings(null)).toBeUndefined();
  });

  it('markItemUploading and markItemRetryPending', () => {
    const q = [
      {
        id: 'a',
        status: 'pending' as const,
        retries: 0,
        uploadPhase: undefined as 'sending' | 'processing' | undefined,
        uploadProgress: { loaded: 1, total: 2 } as { loaded: number; total: number } | undefined,
        error: 'x' as string | undefined,
      },
    ];
    const uploading = markItemUploading(q, 'a');
    expect(uploading[0].status).toBe('uploading');
    expect(uploading[0].uploadPhase).toBe('sending');
    expect(uploading[0].uploadProgress).toBeUndefined();

    const retried = markItemRetryPending([{ ...q[0], status: 'error' as const, retries: 2 }], 'a');
    expect(retried[0].status).toBe('pending');
    expect(retried[0].retries).toBe(3);
    expect(retried[0].error).toBeUndefined();
  });
});

describe('useChapterUploadQueue', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports error when no project is selected', () => {
    const onError = vi.fn();
    const onUpload = vi.fn();
    const { result } = renderHook(() =>
      useChapterUploadQueue({
        projectId: null,
        chapterCount: 0,
        maxFileSize: 1_000_000,
        onUpload,
        onError,
      })
    );

    act(() => {
      result.current.addFiles([new File(['hi'], 'a.txt')]);
    });

    expect(onError).toHaveBeenCalled();
    expect(result.current.queue).toEqual([]);
  });

  it('queues txt upload, marks success, and allows remove', async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 'ch1', title: 'A' });
    const onChaptersUpdate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChapterUploadQueue({
        projectId: 'p1',
        chapterCount: 2,
        maxFileSize: 1_000_000,
        onUpload,
        onChaptersUpdate,
      })
    );

    act(() => {
      result.current.addFiles([new File(['hello'], '03_Chapter.txt')]);
    });

    expect(result.current.showUploadModal).toBe(true);
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].title).toBe('Chapter');

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe('success');
    });
    expect(onUpload).toHaveBeenCalled();
    expect(onChaptersUpdate).toHaveBeenCalled();

    const id = result.current.queue[0].id;
    act(() => {
      result.current.removeItem(id);
    });
    expect(result.current.queue).toHaveLength(0);
  });

  it('marks unsupported and oversized files as error', () => {
    const { result } = renderHook(() =>
      useChapterUploadQueue({
        projectId: 'p1',
        chapterCount: 0,
        maxFileSize: 10,
        onUpload: vi.fn(),
      })
    );

    act(() => {
      result.current.addFiles([
        new File(['x'], 'notes.docx'),
        new File(['01234567890123456789'], 'big.txt'),
      ]);
    });

    expect(result.current.queue.every((q) => q.status === 'error')).toBe(true);
  });

  it('retries failed items and cancels pending', async () => {
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('fail'), { data: { error: 'nope' } }))
      .mockResolvedValueOnce({ id: 'ch1' });

    const { result } = renderHook(() =>
      useChapterUploadQueue({
        projectId: 'p1',
        chapterCount: 0,
        maxFileSize: 1_000_000,
        onUpload,
      })
    );

    act(() => {
      result.current.addFiles([new File(['a'], 'a.txt')]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe('error');
    });

    const id = result.current.queue[0].id;
    act(() => {
      result.current.retryItem(id);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe('success');
    });
  });

  it('marks import job error status from getImportJob', async () => {
    startImportJob.mockResolvedValue({ jobId: 'job-1' });
    getImportJob.mockResolvedValue({
      status: 'error',
      phase: 'parse',
      current: 0,
      total: 1,
      errors: ['bad epub'],
      warnings: [],
    });

    const { result } = renderHook(() =>
      useChapterUploadQueue({
        projectId: 'p1',
        chapterCount: 0,
        maxFileSize: 1_000_000,
        onUpload: vi.fn(),
      })
    );

    act(() => {
      result.current.addFiles([new File(['epub'], 'book.epub')]);
    });

    await waitFor(() => {
      expect(result.current.queue[0]?.status).toBe('error');
    });
    expect(result.current.queue[0]?.error).toContain('bad epub');
  });
});
