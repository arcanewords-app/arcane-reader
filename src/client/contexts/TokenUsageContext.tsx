/**
 * Single source of truth for token usage.
 * Polling (60s) only on projects/project pages; pauses when tab is hidden or on irrelevant routes.
 */

import { createContext } from 'preact';
import { useContext, useState, useCallback, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import {
  AUTH_CHANGED_EVENT,
  authService,
  type AuthChangedDetail,
} from '../services/authService';
import { isTokenUsageRelevant } from '../utils/tokenUsagePaths';
import type { TokenUsage } from '../types';

const REFRESH_INTERVAL_MS = 60_000;
const ROUTE_CHANGE_EVENT = 'arcane:route-change';

function getPathFromUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

type TokenUsageContextValue = {
  usage: TokenUsage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const TokenUsageContext = createContext<TokenUsageContextValue | null>(null);

export function TokenUsageProvider({ children }: { children: preact.ComponentChildren }) {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(() =>
    isTokenUsageRelevant(typeof window !== 'undefined' ? window.location.pathname : '')
  );

  const refresh = useCallback(async () => {
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTokenUsage();
      setUsage(data);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setLoading(false);
        return;
      }
      console.error('Failed to load token usage:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleRouteChange = (e: CustomEvent<{ url: string }>) => {
      const path = getPathFromUrl(e.detail?.url || window.location.pathname);
      setShouldPoll(isTokenUsageRelevant(path));
    };

    window.addEventListener(ROUTE_CHANGE_EVENT, handleRouteChange as EventListener);
    return () => {
      window.removeEventListener(ROUTE_CHANGE_EVENT, handleRouteChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }

    if (!shouldPoll) {
      setLoading(false);
      return;
    }

    refresh();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const scheduleRefresh = () => {
      if (
        shouldPoll &&
        !document.hidden &&
        authService.isAuthenticated() &&
        isTokenUsageRelevant(window.location.pathname)
      ) {
        refresh();
      }
    };

    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(scheduleRefresh, REFRESH_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopInterval();
      } else if (shouldPoll && isTokenUsageRelevant(window.location.pathname)) {
        refresh();
        startInterval();
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh, shouldPoll]);

  useEffect(() => {
    const handleAuthChanged = (e: CustomEvent<AuthChangedDetail>) => {
      if (!e.detail.authenticated) {
        setUsage(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (shouldPoll && isTokenUsageRelevant(window.location.pathname)) {
        refresh();
      }
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, [refresh, shouldPoll]);

  const value: TokenUsageContextValue = {
    usage,
    loading,
    error,
    refresh,
  };

  return <TokenUsageContext.Provider value={value}>{children}</TokenUsageContext.Provider>;
}

export function useTokenUsageContext(): TokenUsageContextValue {
  const ctx = useContext(TokenUsageContext);
  if (!ctx) {
    return {
      usage: null,
      loading: false,
      error: null,
      refresh: async () => {},
    };
  }
  return ctx;
}
