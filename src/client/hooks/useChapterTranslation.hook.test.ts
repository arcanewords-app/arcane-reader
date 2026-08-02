/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, Project } from '../types';

const translateChapter = vi.fn();
const loadTokenUsage = vi.fn();
const checkBeforeTranslate = vi.fn((_estimated: number, onProceed: () => void) => {
  onProceed();
  return 'ok' as const;
});
const isAuthenticated = vi.fn(() => true);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { message?: string }) =>
      opts?.message ? `${key}:${opts.message}` : key,
  }),
}));

vi.mock('../api/client.js', () => ({
  api: {
    translateChapter: (...args: unknown[]) => translateChapter(...args),
  },
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    isAuthenticated: () => isAuthenticated(),
  },
}));

vi.mock('./useTokenLimitCheck.js', () => ({
  useTokenLimitCheck: () => ({
    tokenUsage: { tokensUsed: 0, tokensLimit: 10_000 },
    checkBeforeTranslate,
    warningState: { isOpen: false, estimatedTokens: 0, willExceed: false, onProceed: null },
    closeWarning: vi.fn(),
    confirmAndProceed: vi.fn(),
    loadTokenUsage,
  }),
}));

vi.mock('../config/tokenEstimate.js', () => ({
  estimateChapterTranslationTokensForProject: () => 100,
}));

vi.mock('../../shared/chapterSourceText.js', () => ({
  resolveChapterSourceTextLengthFromOptions: () => 50,
}));

import { useChapterTranslation } from './useChapterTranslation.js';

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'Chapter 1',
    originalText: 'Hello world',
    status: 'pending',
    ...overrides,
  };
}

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

describe('useChapterTranslation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    checkBeforeTranslate.mockImplementation((_estimated: number, onProceed: () => void) => {
      onProceed();
      return 'ok' as const;
    });
    isAuthenticated.mockReturnValue(true);
  });

  it('starts translation and updates chapter status to translating', async () => {
    translateChapter.mockResolvedValue({ status: 'started', chapterId: 'ch-1' });
    const onChapterUpdate = vi.fn();
    const chapter = makeChapter();
    const project = makeProject();

    const { result } = renderHook(() =>
      useChapterTranslation('p1', 'ch-1', chapter, project, onChapterUpdate)
    );

    act(() => {
      result.current.startTranslation();
    });

    await waitFor(() => {
      expect(translateChapter).toHaveBeenCalledWith('p1', 'ch-1', {});
      expect(onChapterUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch-1', status: 'translating' })
      );
    });
    expect(loadTokenUsage).toHaveBeenCalled();
  });

  it('does not start when chapter is already translating', () => {
    const onChapterUpdate = vi.fn();
    const chapter = makeChapter({ status: 'translating' });

    const { result } = renderHook(() =>
      useChapterTranslation('p1', 'ch-1', chapter, makeProject(), onChapterUpdate)
    );

    act(() => {
      result.current.startTranslation();
    });

    expect(checkBeforeTranslate).not.toHaveBeenCalled();
    expect(translateChapter).not.toHaveBeenCalled();
    expect(result.current.translating).toBe(true);
  });

  it('reports 429 via onError and resets translating', async () => {
    translateChapter.mockRejectedValue({
      status: 429,
      data: { message: 'Daily limit' },
    });
    const onError = vi.fn();
    const onChapterUpdate = vi.fn();

    const { result } = renderHook(() =>
      useChapterTranslation('p1', 'ch-1', makeChapter(), makeProject(), onChapterUpdate, onError)
    );

    act(() => {
      result.current.startTranslation();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    expect(onChapterUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    expect(result.current.translating).toBe(false);
  });

  it('clears local translating when chapter status leaves translating', async () => {
    translateChapter.mockResolvedValue({ status: 'started', chapterId: 'ch-1' });
    let chapter = makeChapter();
    const onChapterUpdate = vi.fn((next: Chapter) => {
      chapter = next;
    });

    const { result, rerender } = renderHook(
      ({ ch }) => useChapterTranslation('p1', 'ch-1', ch, makeProject(), onChapterUpdate),
      { initialProps: { ch: chapter } }
    );

    act(() => {
      result.current.startTranslation();
    });

    await waitFor(() => expect(onChapterUpdate).toHaveBeenCalled());

    rerender({ ch: makeChapter({ status: 'completed' }) });

    await waitFor(() => {
      expect(result.current.translating).toBe(false);
    });
  });
});
