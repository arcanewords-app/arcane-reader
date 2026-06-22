/**
 * Service Health Context
 *
 * Listens for service degradation events (503), polls /api/health,
 * and provides banner state for ServiceStatusBanner.
 */

import { createContext } from 'preact';
import { useContext, useState, useCallback, useEffect, useRef } from 'preact/hooks';

const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';
const POLL_INTERVAL_MS = 300_000; // 5 minutes
const RECOVERED_DISPLAY_MS = 5_000;
const HEALTH_FETCH_TIMEOUT_MS = 10_000;

export type ServiceHealthStatus = 'down' | 'degraded' | 'recovered';

export type ServiceHealthState =
  | null
  | { status: 'down'; message: string }
  | { status: 'degraded'; message: string }
  | { status: 'recovered' };

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'down';
  services?: Record<string, { status: string; error?: string }>;
  timestamp?: string;
}

type ServiceHealthContextValue = {
  state: ServiceHealthState;
  retry: () => Promise<void>;
};

const ServiceHealthContext = createContext<ServiceHealthContextValue | null>(null);

async function fetchHealth(): Promise<HealthResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', { signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as HealthResponse;
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function ServiceHealthProvider({ children }: { children: preact.ComponentChildren }) {
  const [state, setState] = useState<ServiceHealthState>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthyCountRef = useRef(0);

  const startPollingRef = useRef<() => void>(() => {});

  const markRecovered = useCallback(() => {
    healthyCountRef.current = 0;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setState({ status: 'recovered' });
    setTimeout(() => setState(null), RECOVERED_DISPLAY_MS);
  }, []);

  const checkHealth = useCallback(
    async (opts?: { immediateRecovery?: boolean }) => {
      try {
        const data = await fetchHealth();
        if (data.status === 'healthy') {
          healthyCountRef.current += 1;
          const shouldRecover = opts?.immediateRecovery || healthyCountRef.current >= 2;
          if (shouldRecover) {
            markRecovered();
          }
        } else {
          healthyCountRef.current = 0;
          const firstService = data.services ? Object.values(data.services)[0] : undefined;
          const message =
            firstService?.error ||
            (data.status === 'down' ? 'Service unavailable' : 'Service degraded');
          setState({
            status: data.status === 'down' ? 'down' : 'degraded',
            message,
          });
          startPollingRef.current();
        }
      } catch {
        healthyCountRef.current = 0;
        setState({ status: 'down', message: 'Service unavailable' });
        startPollingRef.current();
      }
    },
    [markRecovered]
  );

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    healthyCountRef.current = 0;
    checkHealth();
    pollRef.current = setInterval(checkHealth, POLL_INTERVAL_MS);
  }, [checkHealth]);

  startPollingRef.current = startPolling;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const retry = useCallback(async () => {
    await checkHealth({ immediateRecovery: true });
  }, [checkHealth]);

  useEffect(() => {
    const handleDegraded = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string; service?: string }>).detail;
      const message = detail?.message || 'Service temporarily unavailable';
      setState((prev) => {
        if (prev?.status === 'recovered') return prev;
        return { status: 'down', message };
      });
      startPolling();
    };

    window.addEventListener(SERVICE_DEGRADED_EVENT, handleDegraded);

    // Proactive health check on mount: detect issues early without waiting for 503
    checkHealth();

    return () => {
      window.removeEventListener(SERVICE_DEGRADED_EVENT, handleDegraded);
      stopPolling();
    };
  }, [checkHealth, startPolling, stopPolling]);

  return (
    <ServiceHealthContext.Provider value={{ state, retry }}>
      {children}
    </ServiceHealthContext.Provider>
  );
}

export function useServiceHealth(): ServiceHealthContextValue {
  const ctx = useContext(ServiceHealthContext);
  if (!ctx) {
    return {
      state: null,
      retry: async () => {},
    };
  }
  return ctx;
}
