/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.fn();

vi.mock('preact-router', () => ({
  route: (...args: unknown[]) => route(...args),
}));

import { useUrlSync } from './useUrlSync.js';

type TabState = { tab: string };

describe('useUrlSync', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('initializes state from parse()', () => {
    window.history.replaceState({}, '', '/page?tab=home');
    const parse = () => ({ tab: new URLSearchParams(window.location.search).get('tab') ?? 'all' });
    const build = (s: TabState) => `/page?tab=${s.tab}`;

    const { result } = renderHook(() => useUrlSync({ parse, build }));
    expect(result.current.state).toEqual({ tab: 'home' });
  });

  it('syncs state on popstate', () => {
    window.history.replaceState({}, '', '/page?tab=home');
    let parsedTab = 'home';
    const parse = () => ({ tab: parsedTab });
    const build = (s: TabState) => `/page?tab=${s.tab}`;

    const { result } = renderHook(() => useUrlSync({ parse, build }));

    act(() => {
      parsedTab = 'settings';
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.state).toEqual({ tab: 'settings' });
  });

  it('syncs state on arcane:route-change', () => {
    window.history.replaceState({}, '', '/page?tab=home');
    let parsedTab = 'home';
    const parse = () => ({ tab: parsedTab });
    const build = (s: TabState) => `/page?tab=${s.tab}`;

    const { result } = renderHook(() => useUrlSync({ parse, build }));

    act(() => {
      parsedTab = 'profile';
      window.dispatchEvent(new Event('arcane:route-change'));
    });

    expect(result.current.state).toEqual({ tab: 'profile' });
  });

  it('setState updates URL via route()', () => {
    window.history.replaceState({}, '', '/page?tab=home');
    const parse = () => ({ tab: new URLSearchParams(window.location.search).get('tab') ?? 'home' });
    const build = (s: TabState) => `/page?tab=${s.tab}`;

    const { result } = renderHook(() => useUrlSync({ parse, build, historyMode: 'push' }));

    act(() => {
      result.current.setState({ tab: 'archive' });
    });

    expect(route).toHaveBeenCalledWith('/page?tab=archive', false);
    expect(result.current.state).toEqual({ tab: 'archive' });
  });

  it('replaceUrl calls route with replace flag', () => {
    window.history.replaceState({}, '', '/page?tab=home');
    const parse = () => ({ tab: 'home' });
    const build = (s: TabState) => `/page?tab=${s.tab}`;

    const { result } = renderHook(() => useUrlSync({ parse, build }));

    act(() => {
      result.current.replaceUrl({ tab: 'mine' });
    });

    expect(route).toHaveBeenCalledWith('/page?tab=mine', true);
  });
});
