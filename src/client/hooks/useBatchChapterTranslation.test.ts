/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types';

const translateChapter = vi.fn();
const startTranslateBatch = vi.fn();
const getProjectFromStore = vi.fn();
const pollChapterUntilDone = vi.fn();
const checkBeforeTranslate = vi.fn((_estimated: number, onProceed: () => void) => {
  onProceed();
  return 'ok' as const;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../api/client.js', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  api: {
    translateChapter: (...args: unknown[]) => translateChapter(...args),
    startTranslateBatch: (...args: unknown[]) => startTranslateBatch(...args),
    cancelTranslation: vi.fn().mockResolvedValue(undefined),
    cancelAnalysisJob: vi.fn().mockResolvedValue(undefined),
    cancelTranslateJob: vi.fn().mockResolvedValue(undefined),
    markChaptersAsTranslatedBatch: vi.fn(),
    startAnalyzeBatch: vi.fn(),
  },
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    isAuthenticated: () => true,
  },
}));

vi.mock('./useTokenLimitCheck.js', () => ({
  useTokenLimitCheck: () => ({
    tokenUsage: { tokensUsed: 0, tokensLimit: 100_000 },
    checkBeforeTranslate,
    loadTokenUsage: vi.fn(),
    warningState: { isOpen: false, estimatedTokens: 0, willExceed: false, onProceed: null },
    closeWarning: vi.fn(),
    confirmAndProceed: vi.fn(),
  }),
}));

vi.mock('../config/tokenEstimate.js', () => ({
  estimateBatchTranslationTokensForProject: () => 200,
}));

vi.mock('../store/projects.js', () => ({
  getProject: (...args: unknown[]) => getProjectFromStore(...args),
}));

vi.mock('./batchTranslationPoll.js', () => ({
  pollChapterUntilDone: (...args: unknown[]) => pollChapterUntilDone(...args),
}));

import { useBatchChapterTranslation } from './useBatchChapterTranslation.js';

function makeProject(): Project {
  return {
    id: 'p1',
    name: 'Test',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    chapters: [],
    glossary: [],
    settings: { temperature: 0.7 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('useBatchChapterTranslation (unit)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    checkBeforeTranslate.mockImplementation((_estimated: number, onProceed: () => void) => {
      onProceed();
      return 'ok' as const;
    });
  });

  it('does nothing when chapter list is empty', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBatchChapterTranslation('p1', makeProject(), onRefresh));

    act(() => {
      result.current.startBatch([]);
    });

    expect(checkBeforeTranslate).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });

  it('runs single-chapter sync path with poll and completes progress', async () => {
    translateChapter.mockResolvedValue({ status: 'started' });
    pollChapterUntilDone.mockResolvedValue({ success: true });
    getProjectFromStore.mockResolvedValue({
      ...makeProject(),
      chapters: [
        {
          id: 'ch-1',
          number: 1,
          title: 'One',
          status: 'completed',
          originalText: 'x',
          translationMeta: { tokensUsed: 10, duration: 100, model: 'm', translatedAt: 't' },
        },
      ],
      glossary: [],
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useBatchChapterTranslation('p1', makeProject(), onRefresh));

    act(() => {
      result.current.startBatch([
        { id: 'ch-1', number: 1, title: 'One', status: 'pending', originalText: 'hi' } as never,
      ]);
    });

    await waitFor(() => {
      expect(translateChapter).toHaveBeenCalled();
      expect(pollChapterUntilDone).toHaveBeenCalled();
      expect(result.current.isRunning).toBe(false);
    });
    expect(result.current.progress?.completed).toBe(1);
    expect(result.current.progress?.chapters[0]?.status).toBe('completed');
  });

  it('starts async translate batch for multiple chapters', async () => {
    startTranslateBatch.mockResolvedValue({ jobId: 'job-1' });
    const onBatchJobCreated = vi.fn();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useBatchChapterTranslation('p1', makeProject(), onRefresh, undefined, onBatchJobCreated)
    );

    act(() => {
      result.current.startBatch([
        { id: 'ch-1', number: 1, title: 'One', status: 'pending' } as never,
        { id: 'ch-2', number: 2, title: 'Two', status: 'pending' } as never,
      ]);
    });

    await waitFor(() => {
      expect(startTranslateBatch).toHaveBeenCalled();
      expect(onBatchJobCreated).toHaveBeenCalled();
      expect(result.current.isRunning).toBe(false);
    });
  });
});
