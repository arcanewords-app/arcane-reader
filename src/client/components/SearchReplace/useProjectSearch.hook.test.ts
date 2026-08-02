/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterListItem, ProjectSearchMatch } from '../../types.js';

const searchProject = vi.fn();

vi.mock('../../api/client.js', () => ({
  api: {
    searchProject: (...args: unknown[]) => searchProject(...args),
  },
}));

import { useProjectSearch } from './useProjectSearch.js';

const chapters: ChapterListItem[] = [
  { id: 'ch1', number: 1, title: 'One', status: 'completed' },
  { id: 'ch2', number: 2, title: 'Two', status: 'pending' },
];

const sampleMatch: ProjectSearchMatch = {
  chapterId: 'ch1',
  chapterNumber: 1,
  chapterTitle: 'One',
  paragraphId: 'p1',
  paragraphIndex: 0,
  field: 'translated',
  snippet: 'needle',
  fullText: 'needle in haystack',
};

describe('useProjectSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchProject.mockResolvedValue({
      matches: [sampleMatch],
      hasMore: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('updates query state immediately', () => {
    const { result } = renderHook(() =>
      useProjectSearch({
        projectId: 'proj-1',
        isOpen: true,
        isOriginalReadingMode: false,
        chapters,
      })
    );

    act(() => {
      result.current.setQuery('alpha');
    });

    expect(result.current.query).toBe('alpha');
  });

  it('does not call searchProject when panel is closed', async () => {
    const { result } = renderHook(() =>
      useProjectSearch({
        projectId: 'proj-1',
        isOpen: false,
        isOriginalReadingMode: false,
        chapters,
      })
    );

    act(() => {
      result.current.setQuery('needle');
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(searchProject).not.toHaveBeenCalled();
  });

  it('searches translated field after debounce when open', async () => {
    const { result } = renderHook(() =>
      useProjectSearch({
        projectId: 'proj-1',
        isOpen: true,
        isOriginalReadingMode: false,
        chapters,
      })
    );

    act(() => {
      result.current.setQuery('needle');
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(searchProject).toHaveBeenCalledWith(
        'proj-1',
        'needle',
        expect.objectContaining({
          field: 'translated',
          caseSensitive: false,
          wholeWord: false,
        })
      );
    });

    expect(result.current.debouncedQuery).toBe('needle');
    expect(result.current.filteredMatches).toHaveLength(1);
    expect(result.current.filteredMatches[0].paragraphId).toBe('p1');
  });

  it('clears matches without API call when query becomes empty', async () => {
    const { result } = renderHook(() =>
      useProjectSearch({
        projectId: 'proj-1',
        isOpen: true,
        isOriginalReadingMode: false,
        chapters,
      })
    );

    act(() => {
      result.current.setQuery('needle');
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.filteredMatches).toHaveLength(1);
    });

    searchProject.mockClear();

    act(() => {
      result.current.setQuery('');
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(searchProject).not.toHaveBeenCalled();
    expect(result.current.filteredMatches).toHaveLength(0);
    expect(result.current.debouncedQuery).toBe('');
  });
});
