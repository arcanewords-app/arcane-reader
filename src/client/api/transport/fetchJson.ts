import { authService, isReadingRoute, openAuthModal } from '../../services/authService.js';
import { apiErrorFromBody, parseApiErrorFromResponse } from '../errors.js';

/**
 * Custom event name for authentication errors
 */
const AUTH_ERROR_EVENT = 'arcane:auth-error';

/**
 * Custom event name for service unavailability (503)
 */
const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';

export const REFRESH_URL = '/api/auth/refresh';

/** Shared refresh promise so concurrent 401s wait for the same refresh */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Helper to handle 401 errors consistently
 * Clears auth storage, dispatches event for app to handle, and redirects if needed
 */
export function handleAuthError(response: Response): void {
  if (response.status !== 401) return;

  const pathname = window.location.pathname;
  const onReadingRoute = isReadingRoute(pathname);

  if (onReadingRoute) {
    openAuthModal({ redirect: pathname + window.location.search });
  }

  authService.clearStorage();

  window.dispatchEvent(
    new CustomEvent(AUTH_ERROR_EVENT, {
      detail: { message: 'Токен истек. Пожалуйста, войдите снова.' },
    })
  );

  if (onReadingRoute) return;

  if (pathname !== '/') {
    window.location.href = '/?login=required';
  } else {
    const url = new URL(window.location.href);
    url.searchParams.set('login', 'required');
    window.history.replaceState({}, '', url.toString());
  }
}

export async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = authService.refresh({ silent: true });
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function dispatchServiceDegraded(data: { error?: string; service?: string }): void {
  window.dispatchEvent(
    new CustomEvent(SERVICE_DEGRADED_EVENT, {
      detail: {
        message: data.error || 'Service temporarily unavailable',
        service: data.service || 'supabase',
      },
    })
  );
}

async function handle503Response(response: Response): Promise<never> {
  const data = await parseApiErrorFromResponse(response);
  const isServiceUnavailable = data?.code === 'SERVICE_UNAVAILABLE' || data?.service != null;
  if (isServiceUnavailable) {
    dispatchServiceDegraded(data);
  }
  throw apiErrorFromBody(data, 503, data?.error || `HTTP ${response.status}`);
}

export async function fetchJson<T>(
  url: string,
  options?: RequestInit,
  isRetry = false
): Promise<T> {
  const token = authService.getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    const isRefreshEndpoint = url.includes(REFRESH_URL);
    if (!isRefreshEndpoint && !isRetry) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return fetchJson<T>(url, options, true);
      }
    }
    handleAuthError(response);
    const data = await parseApiErrorFromResponse(response);
    throw apiErrorFromBody(data, 401, data.error || 'Unauthorized');
  }

  if (response.status === 503) {
    return handle503Response(response);
  }

  if (!response.ok) {
    const data = await parseApiErrorFromResponse(response);
    throw apiErrorFromBody(data, response.status, data.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
