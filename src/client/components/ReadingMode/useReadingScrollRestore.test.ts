/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/preact';
import { createRef } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRoute = vi.fn();

vi.mock('preact-router', () => ({
  route: (...args: unknown[]) => mockRoute(...args),
}));

import { useReadingScrollRestore } from './useReadingScrollRestore.js';

describe('useReadingScrollRestore', () => {
  afterEach(() => {
    mockRoute.mockReset();
  });

  it('scrolls to top on chapter change when not restoring a paragraph', () => {
    const content = document.createElement('div');
    content.scrollTop = 120;
    const contentRef = createRef<HTMLDivElement>();
    contentRef.current = content;
    const headerRef = createRef<HTMLDivElement>();
    const resetChromeOnChapterChange = vi.fn();
    const lastSyncedParagraphUrlRef = { current: -1 };

    const { rerender } = renderHook(
      (props: { chapterIndex: number }) =>
        useReadingScrollRestore({
          contentRef,
          headerRef,
          headerHeight: 80,
          isPublicationMode: true,
          publicationPath: 'demo',
          currentChapter: { id: 'c1', number: 1, title: 'One' },
          currentChapterIndex: props.chapterIndex,
          chapters: [
            { id: 'c1', number: 1, title: 'One' },
            { id: 'c2', number: 2, title: 'Two' },
          ],
          initialChapterId: 'c1',
          chapterContentMap: {},
          chapterContentLoading: false,
          lastSyncedParagraphUrlRef,
          resetChromeOnChapterChange,
        }),
      { initialProps: { chapterIndex: 0 } }
    );

    act(() => {
      rerender({ chapterIndex: 1 });
    });

    expect(content.scrollTop).toBe(0);
    expect(resetChromeOnChapterChange).toHaveBeenCalled();
  });

  it('skips scroll-to-top when resuming mid-chapter', () => {
    const content = document.createElement('div');
    content.scrollTop = 50;
    const contentRef = createRef<HTMLDivElement>();
    contentRef.current = content;
    const headerRef = createRef<HTMLDivElement>();
    const resetChromeOnChapterChange = vi.fn();

    renderHook(() =>
      useReadingScrollRestore({
        contentRef,
        headerRef,
        headerHeight: 80,
        isPublicationMode: true,
        publicationPath: 'demo',
        currentChapter: { id: 'c1', number: 1, title: 'One' },
        currentChapterIndex: 0,
        chapters: [{ id: 'c1', number: 1, title: 'One' }],
        initialChapterId: 'c1',
        initialParagraphIndex: 4,
        chapterContentMap: { c1: 'text' },
        chapterContentLoading: false,
        lastSyncedParagraphUrlRef: { current: -1 },
        resetChromeOnChapterChange,
      })
    );

    expect(content.scrollTop).toBe(50);
    expect(resetChromeOnChapterChange).not.toHaveBeenCalled();
  });
});
