import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { route } from 'preact-router';

export type UrlSyncHistoryMode = 'push' | 'replace';

export type UseUrlSyncOptions<T> = {
  parse: () => T;
  build: (state: T) => string;
  pathnameGuard?: () => boolean;
  historyMode?: UrlSyncHistoryMode;
  initialState?: T;
};

export function useUrlSync<T>(options: UseUrlSyncOptions<T>) {
  const { parse, build, pathnameGuard, historyMode = 'replace', initialState } = options;
  const [state, setStateInternal] = useState<T>(() => initialState ?? parse());
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncFromUrl = useCallback(() => {
    if (pathnameGuard && !pathnameGuard()) return;
    setStateInternal(parse());
  }, [parse, pathnameGuard]);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('arcane:route-change', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('arcane:route-change', syncFromUrl);
    };
  }, [syncFromUrl]);

  const setState = useCallback(
    (next: T | ((prev: T) => T), opts?: { syncUrl?: boolean }) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(stateRef.current) : next;
      setStateInternal(resolved);
      if (opts?.syncUrl === false) return;
      if (pathnameGuard && !pathnameGuard()) return;
      const url = build(resolved);
      const current = window.location.pathname + window.location.search;
      if (current === url) return;
      route(url, historyMode === 'replace');
    },
    [build, pathnameGuard, historyMode]
  );

  const replaceUrl = useCallback(
    (next: T) => {
      if (pathnameGuard && !pathnameGuard()) return;
      const url = build(next);
      const current = window.location.pathname + window.location.search;
      if (current === url) return;
      route(url, true);
    },
    [build, pathnameGuard]
  );

  return { state, setState, syncFromUrl, replaceUrl };
}

/** Listen for browser history / router changes and re-sync local state from URL. */
export function useUrlSyncListeners(syncFromUrl: () => void, pathnameGuard?: () => boolean) {
  const syncRef = useRef(syncFromUrl);
  syncRef.current = syncFromUrl;
  const guardRef = useRef(pathnameGuard);
  guardRef.current = pathnameGuard;

  useEffect(() => {
    const sync = () => {
      if (guardRef.current && !guardRef.current()) return;
      syncRef.current();
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('arcane:route-change', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('arcane:route-change', sync);
    };
  }, []);
}
