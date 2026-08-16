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

describe('useChapterSearchReplace (unit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search and navigates matches', async () => {
    const onHighlightChange = vi.fn();
    const onScrollToRequest = vi.fn();
    const onReplace = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useChapterSearchReplace({
        paragraphs,
        isOriginalReadingMode: false,
        onHighlightChange,
        onScrollToRequest,
        onReplace,
      })
    );

    act(() => {
      result.current.setFind('привет');
      result.current.setReplace('хай');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.matches.length).toBe(2);
      expect(result.current.canReplace).toBe(true);
    });

    act(() => {
      result.current.handleNext();
    });
    expect(result.current.currentIndex).toBe(1);

    act(() => {
      result.current.handlePrev();
    });
    expect(result.current.currentIndex).toBe(0);

    act(() => {
      result.current.handleRowClick(result.current.matches[1], 1);
    });
    expect(onScrollToRequest).toHaveBeenCalledWith('p2');

    await act(async () => {
      await result.current.handleReplace();
    });
    expect(onReplace).toHaveBeenCalled();

    await act(async () => {
      await result.current.handleReplaceAll();
    });
    expect(result.current.showPreview).toBe(true);
    expect(result.current.previewItems.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.handleConfirmReplaceAll();
    });
    expect(result.current.showPreview).toBe(false);
  });
});
