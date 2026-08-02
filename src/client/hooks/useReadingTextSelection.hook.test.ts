/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'preact';
import type { RefObject } from 'preact';

const getSelectionSnapshotInContainer = vi.fn();

vi.mock('../utils/readingSelection.js', () => ({
  getSelectionSnapshotInContainer: (...args: unknown[]) => getSelectionSnapshotInContainer(...args),
}));

import { useReadingTextSelection } from './useReadingTextSelection.js';

function mountHook(
  enabled = true,
  resetKey?: string
): { container: HTMLDivElement; containerRef: RefObject<HTMLDivElement> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const containerRef = createRef<HTMLDivElement>();
  containerRef.current = container;

  renderHook(() =>
    useReadingTextSelection({
      enabled,
      containerRef,
      resetKey,
    })
  );

  return { container, containerRef };
}

describe('useReadingTextSelection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  beforeEach(() => {
    getSelectionSnapshotInContainer.mockReturnValue(null);
  });

  it('clears selection when disabled', async () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 } as DOMRect;
    getSelectionSnapshotInContainer.mockReturnValue({
      text: 'hello',
      rect,
      wasTruncated: false,
    });

    const { container } = mountHook(true);
    act(() => {
      container.dispatchEvent(new Event('pointerup'));
    });

    await waitFor(() => {
      expect(getSelectionSnapshotInContainer).toHaveBeenCalled();
    });

    const { result } = renderHook(() =>
      useReadingTextSelection({
        enabled: false,
        containerRef: { current: container },
      })
    );

    expect(result.current.selectionState).toBeNull();
  });

  it('syncs selection after pointerup on container', async () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 } as DOMRect;
    getSelectionSnapshotInContainer.mockReturnValue({
      text: 'selected text',
      rect,
      wasTruncated: false,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const containerRef = createRef<HTMLDivElement>();
    containerRef.current = container;

    const { result } = renderHook(() =>
      useReadingTextSelection({
        enabled: true,
        containerRef,
      })
    );

    await act(async () => {
      container.dispatchEvent(new Event('pointerup'));
      await new Promise((r) => requestAnimationFrame(r));
    });

    await waitFor(() => {
      expect(result.current.selectionState).toEqual({
        text: 'selected text',
        rect,
        wasTruncated: false,
      });
    });
  });

  it('clears selection when resetKey changes', async () => {
    const rect = { x: 0, y: 0, width: 1, height: 1 } as DOMRect;
    getSelectionSnapshotInContainer.mockReturnValue({
      text: 'keep',
      rect,
      wasTruncated: false,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const containerRef = createRef<HTMLDivElement>();
    containerRef.current = container;

    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useReadingTextSelection({
          enabled: true,
          containerRef,
          resetKey,
        }),
      { initialProps: { resetKey: 'ch1' } }
    );

    await act(async () => {
      container.dispatchEvent(new Event('pointerup'));
      await new Promise((r) => requestAnimationFrame(r));
    });

    await waitFor(() => {
      expect(result.current.selectionState?.text).toBe('keep');
    });

    rerender({ resetKey: 'ch2' });

    await waitFor(() => {
      expect(result.current.selectionState).toBeNull();
    });
  });
});
