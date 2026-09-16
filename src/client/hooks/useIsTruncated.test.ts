/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/preact';
import { createRef } from 'preact';
import { describe, expect, it } from 'vitest';
import { useIsTruncated } from './useIsTruncated.js';

describe('useIsTruncated', () => {
  it('returns false when inactive', () => {
    const ref = createRef<HTMLElement>();
    const { result } = renderHook(() => useIsTruncated(ref, false));
    expect(result.current).toBe(false);
  });

  it('returns false when content fits', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });

    const ref = createRef<HTMLElement>();
    ref.current = el;
    const { result } = renderHook(() => useIsTruncated(ref, true));
    expect(result.current).toBe(false);
    document.body.removeChild(el);
  });

  it('returns true when content overflows', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 200 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });

    const ref = createRef<HTMLElement>();
    ref.current = el;
    const { result } = renderHook(() => useIsTruncated(ref, true));
    expect(result.current).toBe(true);
    document.body.removeChild(el);
  });
});
