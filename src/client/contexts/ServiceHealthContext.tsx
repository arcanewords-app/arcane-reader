/**
 * Service Health Context
 *
 * Listens for service degradation events (503), polls /api/health,
 * and provides banner state for ServiceStatusBanner.
 */

import { createContext } from 'preact';
import { useContext, useState, useCallback, useEffect, useRef } from 'preact/hooks';

const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';
const POLL_INTERVAL_MS = 15_000;
const RECOVERED_DISPLAY_MS = 5_000;

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
  const res = await fetch('/api/health');
  const data = (await res.json().catch(() => ({}))) as HealthResponse;
  return data;
}

export function ServiceHealthProvider({ children }: { children: preact.ComponentChildren }) {
  const [state, setState] = useState<ServiceHealthState>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthyCountRef = useRef(0);

  const checkHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      if (data.status === 'healthy') {
        healthyCountRef.current += 1;
        if (healthyCountRef.current >= 2) {
          healthyCountRef.current = 0;
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setState({ status: 'recovered' });
          setTimeout(() => setState(null), RECOVERED_DISPLAY_MS);
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
      }
    } catch {
      healthyCountRef.current = 0;
      setState({ status: 'down', message: 'Service unavailable' });
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    healthyCountRef.current = 0;
    checkHealth();
    pollRef.current = setInterval(checkHealth, POLL_INTERVAL_MS);
  }, [checkHealth]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const retry = useCallback(async () => {
    await checkHealth();
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
    return () => {
      window.removeEventListener(SERVICE_DEGRADED_EVENT, handleDegraded);
      stopPolling();
    };
  }, [startPolling, stopPolling]);

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
