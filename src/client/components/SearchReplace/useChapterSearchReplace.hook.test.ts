/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../types.js';
import { useChapterSearchReplace } from './useChapterSearchReplace.js';

const paragraphs: Paragraph[] = [
  {
    id: 'p1',
    index: 0,
    originalText: 'Hello world',
    translatedText: 'Привет мир',
    status: 'translated',
  },
  {
    id: 'p2',
    index: 1,
    originalText: 'Another hello',
    translatedText: 'Ещё привет',
    status: 'translated',
  },
];

describe('useChapterSearchReplace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates find state immediately', () => {
    const onHighlightChange = vi.fn();
    const { result } = renderHook(() =>
      useChapterSearchReplace({
        paragraphs,
        isOriginalReadingMode: false,
        onHighlightChange,
      })
    );

    act(() => {
      result.current.setFind('привет');
    });

    expect(result.current.find).toBe('привет');
  });

  it('debounces search and finds translated matches', async () => {
    const onHighlightChange = vi.fn();
    const { result } = renderHook(() =>
      useChapterSearchReplace({
        paragraphs,
        isOriginalReadingMode: false,
        onHighlightChange,
      })
    );

    act(() => {
      result.current.setFind('привет');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.debouncedFind).toBe('привет');
      expect(result.current.matches.length).toBe(2);
    });
  });

  it('resets current index when debounced find changes', async () => {
    const onHighlightChange = vi.fn();
    const { result } = renderHook(() =>
      useChapterSearchReplace({
        paragraphs,
        isOriginalReadingMode: false,
        onHighlightChange,
      })
    );

    act(() => {
      result.current.setFind('привет');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.matches.length).toBe(2));

    act(() => {
      result.current.handleNext();
    });

    expect(result.current.currentIndex).toBe(1);

    act(() => {
      result.current.setFind('ещё');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.currentIndex).toBe(0);
      expect(result.current.matches.length).toBe(1);
    });
  });

  it('notifies parent of highlight state', async () => {
    const onHighlightChange = vi.fn();
    const { result } = renderHook(() =>
      useChapterSearchReplace({
        paragraphs,
        isOriginalReadingMode: false,
        onHighlightChange,
      })
    );

    act(() => {
      result.current.setFind('привет');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onHighlightChange).toHaveBeenCalledWith(
        expect.objectContaining({
          paragraphIds: ['p1', 'p2'],
          currentParagraphId: 'p1',
        })
      );
    });
  });
});
