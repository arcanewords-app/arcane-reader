/**
 * Single source of truth for token usage.
 * One refresh interval (60s) for the whole app; polling pauses when tab is hidden.
 */

import { createContext } from 'preact';
import { useContext, useState, useCallback, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import { authService } from '../services/authService';
import type { TokenUsage } from '../types';

const REFRESH_INTERVAL_MS = 60_000;

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
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }

    refresh();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const scheduleRefresh = () => {
      if (!document.hidden && authService.isAuthenticated()) {
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
      } else {
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
  }, [refresh]);

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
