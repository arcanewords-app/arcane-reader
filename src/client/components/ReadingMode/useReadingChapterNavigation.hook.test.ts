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

describe('useReadingChapterNavigation jump confirm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks to confirm when jumping more than one chapter ahead', async () => {
    const onSetProgress = vi.fn();
    const { result } = renderNav({ lastReadChapterNumber: 1, onSetProgress });

    await waitFor(() => {
      assert.equal(result.current.chapters.length, 4);
      assert.equal(result.current.currentChapterIndex, 0);
    });

    act(() => {
      result.current.navigateToChapterIndex(3);
    });

    assert.deepEqual(result.current.jumpConfirm, { targetIndex: 3, chapterNumber: 5 });
    assert.equal(result.current.currentChapterIndex, 0);
    assert.equal(onSetProgress.mock.calls.length, 0);
  });

  it('Yes sets watermark and navigates', async () => {
    const onSetProgress = vi.fn();
    const { result } = renderNav({ lastReadChapterNumber: 1, onSetProgress });

    await waitFor(() => {
      assert.equal(result.current.chapters.length, 4);
    });

    act(() => {
      result.current.navigateToChapterIndex(3);
    });
    act(() => {
      result.current.handleJumpConfirm();
    });

    assert.equal(result.current.jumpConfirm, null);
    assert.equal(result.current.currentChapterIndex, 3);
    assert.deepEqual(onSetProgress.mock.calls[0], [5, 'set']);
    assert.equal(
      mockRoute.mock.calls.some((c) => String(c[0]).includes('/chapters/ch5/')),
      true
    );
  });

  it('No navigates without changing watermark', async () => {
    const onSetProgress = vi.fn();
    const { result } = renderNav({ lastReadChapterNumber: 1, onSetProgress });

    await waitFor(() => {
      assert.equal(result.current.chapters.length, 4);
    });

    act(() => {
      result.current.navigateToChapterIndex(3);
    });
    act(() => {
      result.current.handleJumpCancel();
    });

    assert.equal(result.current.jumpConfirm, null);
    assert.equal(result.current.currentChapterIndex, 3);
    assert.equal(onSetProgress.mock.calls.length, 0);
    assert.equal(
      mockRoute.mock.calls.some((c) => String(c[0]).includes('/chapters/ch5/')),
      true
    );
  });
});
