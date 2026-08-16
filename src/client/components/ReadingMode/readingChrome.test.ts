import { describe, expect, it } from 'vitest';
import {
  EDGE_THRESHOLD,
  computeChromeFromScroll,
  computeChromeVisibility,
  computeNearEdges,
} from './readingChrome.js';

describe('readingChrome', () => {
  it('computeNearEdges detects top and bottom', () => {
    expect(computeNearEdges({ scrollTop: 0, scrollHeight: 2000, clientHeight: 800 })).toEqual({
      isNearTop: true,
      isNearBottom: false,
    });
    expect(computeNearEdges({ scrollTop: 50, scrollHeight: 2000, clientHeight: 800 })).toEqual({
      isNearTop: true,
      isNearBottom: false,
    });
    expect(
      computeNearEdges({
        scrollTop: EDGE_THRESHOLD + 1,
        scrollHeight: 2000,
        clientHeight: 800,
      })
    ).toEqual({ isNearTop: false, isNearBottom: false });
    expect(computeNearEdges({ scrollTop: 0, scrollHeight: 500, clientHeight: 800 })).toEqual({
      isNearTop: true,
      isNearBottom: true,
    });
    expect(computeNearEdges({ scrollTop: 1100, scrollHeight: 2000, clientHeight: 800 })).toEqual({
      isNearTop: false,
      isNearBottom: true,
    });
  });

  it('hides menu after enough downward scroll', () => {
    const mid = computeChromeFromScroll({
      scrollTop: 200,
      scrollHeight: 2000,
      clientHeight: 800,
      delta: 30,
      scrollAccum: 0,
      scrollUpAccum: 10,
      menuVisible: true,
    });
    expect(mid.menuVisible).toBe(true);
    expect(mid.scrollAccum).toBe(30);
    expect(mid.scrollUpAccum).toBe(0);
    expect(mid.didHideMenu).toBe(false);

    const hide = computeChromeFromScroll({
      scrollTop: 260,
      scrollHeight: 2000,
      clientHeight: 800,
      delta: 30,
      scrollAccum: 30,
      scrollUpAccum: 0,
      menuVisible: true,
    });
    expect(hide.menuVisible).toBe(false);
    expect(hide.didHideMenu).toBe(true);
    expect(hide.scrollAccum).toBe(0);
  });

  it('shows menu after enough upward scroll', () => {
    const show = computeChromeFromScroll({
      scrollTop: 100,
      scrollHeight: 2000,
      clientHeight: 800,
      delta: -60,
      scrollAccum: 40,
      scrollUpAccum: 0,
      menuVisible: false,
    });
    expect(show.menuVisible).toBe(true);
    expect(show.scrollAccum).toBe(0);
    expect(show.scrollUpAccum).toBe(0);
  });

  it('computeChromeVisibility ORs menu with edges', () => {
    expect(
      computeChromeVisibility({ menuVisible: false, isNearTop: true, isNearBottom: false })
    ).toEqual({ headerVisible: true, footerVisible: false });
    expect(
      computeChromeVisibility({ menuVisible: false, isNearTop: false, isNearBottom: true })
    ).toEqual({ headerVisible: false, footerVisible: true });
    expect(
      computeChromeVisibility({ menuVisible: true, isNearTop: false, isNearBottom: false })
    ).toEqual({ headerVisible: true, footerVisible: true });
  });
});
