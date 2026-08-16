/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, describe, it, vi } from 'vitest';

const mockRoute = vi.fn();

vi.mock('preact-router', () => ({
  route: (...args: unknown[]) => mockRoute(...args),
}));

import { useReadingChapterNavigation } from './useReadingChapterNavigation.js';

const publicationChapters = [
  { id: 'ch1', number: 1, title: 'One' },
  { id: 'ch2', number: 2, title: 'Two' },
  { id: 'ch3', number: 3, title: 'Three' },
  { id: 'ch5', number: 5, title: 'Five' },
];

function renderNav(overrides?: {
  lastReadChapterNumber?: number;
  initialChapterId?: string;
  onSetProgress?: (chapterNumber: number, mode: 'complete' | 'set') => void;
}) {
  const lastSyncedParagraphUrlRef = { current: -1 };
  const onSetProgress = overrides?.onSetProgress ?? vi.fn();
  return renderHook(() =>
    useReadingChapterNavigation({
      isPublicationMode: true,
      publicationPath: 'demo',
      publicationId: 'pub-1',
      publicationChapters,
      initialChapterId: overrides?.initialChapterId ?? 'ch1',
      lastReadChapterNumber: overrides?.lastReadChapterNumber ?? 1,
      onSetProgress,
      lastSyncedParagraphUrlRef,
    })
  );
}

describe('useReadingChapterNavigation (unit)', () => {
  afterEach(() => {
    mockRoute.mockReset();
  });

  it('loads publication chapters and selects initial id', async () => {
    const { result } = renderNav({ initialChapterId: 'ch3' });
    await waitFor(() => {
      assert.equal(result.current.chapters.length, 4);
      assert.equal(result.current.currentChapter?.id, 'ch3');
    });
  });

  it('prompts jump confirm when jumping ahead', async () => {
    const { result } = renderNav({ lastReadChapterNumber: 1 });
    await waitFor(() => assert.equal(result.current.chapters.length, 4));

    act(() => {
      result.current.navigateToChapterIndex(3);
    });

    assert.ok(result.current.jumpConfirm);
    assert.equal(result.current.jumpConfirm?.chapterNumber, 5);
  });

  it('navigates after jump confirm', async () => {
    const onSetProgress = vi.fn();
    const { result } = renderNav({ lastReadChapterNumber: 1, onSetProgress });
    await waitFor(() => assert.equal(result.current.chapters.length, 4));

    act(() => {
      result.current.navigateToChapterIndex(3);
    });
    act(() => {
      result.current.handleJumpConfirm();
    });

    assert.equal(result.current.jumpConfirm, null);
    assert.equal(result.current.currentChapter?.id, 'ch5');
    assert.equal(onSetProgress.mock.calls[0]?.[0], 5);
  });

  it('handlePrevChapter moves backward', async () => {
    const { result } = renderNav({
      initialChapterId: 'ch2',
      lastReadChapterNumber: 5,
    });
    await waitFor(() => assert.equal(result.current.currentChapter?.id, 'ch2'));

    act(() => {
      result.current.handlePrevChapter();
    });
    assert.equal(result.current.currentChapter?.id, 'ch1');
  });
});
