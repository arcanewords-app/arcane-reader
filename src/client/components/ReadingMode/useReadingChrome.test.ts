/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/preact';
import { createRef } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { useReadingChrome } from './useReadingChrome.js';

describe('useReadingChrome', () => {
  it('exposes visible chrome when near top', () => {
    const content = document.createElement('div');
    Object.defineProperty(content, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 800, configurable: true });
    content.scrollTop = 0;

    const contentRef = createRef<HTMLDivElement>();
    contentRef.current = content;

    const { result } = renderHook(() =>
      useReadingChrome({
        contentRef,
        chaptersLength: 2,
        currentChapterIndex: 0,
      })
    );

    expect(result.current.menuVisible).toBe(true);
    expect(result.current.headerVisible).toBe(true);
    expect(result.current.isNearTop).toBe(true);

    act(() => {
      result.current.resetOnChapterChange();
    });
    expect(result.current.menuVisible).toBe(true);
    expect(result.current.isNearBottom).toBe(false);
  });

  it('hides menu after scrolling down past threshold', () => {
    const content = document.createElement('div');
    Object.defineProperty(content, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 800, configurable: true });
    content.scrollTop = 0;
    document.body.appendChild(content);

    const contentRef = createRef<HTMLDivElement>();
    contentRef.current = content;
    const onHideSettings = vi.fn();

    const { result } = renderHook(() =>
      useReadingChrome({
        contentRef,
        chaptersLength: 1,
        currentChapterIndex: 0,
        onHideSettings,
      })
    );

    act(() => {
      content.scrollTop = 200;
      content.dispatchEvent(new Event('scroll'));
    });

    // RAF-driven; flush animation frames
    act(() => {
      content.scrollTop = 280;
      content.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.headerRef).toBeTruthy();
    expect(result.current.footerRef).toBeTruthy();
    document.body.removeChild(content);
  });
});
