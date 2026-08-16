/** @vitest-environment happy-dom */
import { renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { createRef } from 'preact';
import { useAnchoredPopup } from './useAnchoredPopup.js';

describe('useAnchoredPopup', () => {
  it('defaults to above/start when closed', () => {
    const ref = createRef<HTMLElement>();
    const { result } = renderHook(() => useAnchoredPopup(ref, false));
    expect(result.current).toEqual({ vertical: 'above', horizontal: 'start' });
  });

  it('flips below when there is little space above', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({
        top: 20,
        bottom: 40,
        left: 10,
        right: 80,
        width: 70,
        height: 20,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    const ref = createRef<HTMLElement>();
    ref.current = el;
    const { result } = renderHook(() => useAnchoredPopup(ref, true));
    expect(result.current.vertical).toBe('below');
    document.body.removeChild(el);
  });

  it('aligns end when near the right edge', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const viewportWidth = window.innerWidth;
    el.getBoundingClientRect = () =>
      ({
        top: 400,
        bottom: 420,
        left: viewportWidth - 40,
        right: viewportWidth - 10,
        width: 30,
        height: 20,
        x: viewportWidth - 40,
        y: 400,
        toJSON: () => ({}),
      }) as DOMRect;

    const ref = createRef<HTMLElement>();
    ref.current = el;
    const { result } = renderHook(() => useAnchoredPopup(ref, true));
    expect(result.current.horizontal).toBe('end');
    document.body.removeChild(el);
  });
});
