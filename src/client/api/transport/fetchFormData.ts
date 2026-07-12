import { authService } from '../../services/authService.js';
import { apiErrorFromBody, parseApiErrorFromResponse } from '../errors.js';
import { handleAuthError, REFRESH_URL, tryRefresh } from './fetchJson.js';

const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';

/**
 * Fetch helper for FormData requests (multipart/form-data)
 * Does not set Content-Type header (browser will set it with boundary)
 * Note: FormData body is consumed on send, so we cannot retry. On 401 we try refresh;
 * if refresh succeeds we throw ApiError (token is fresh, user can retry the action).
 */
export async function fetchFormData<T>(
  url: string,
  formData: FormData,
  options?: RequestInit
): Promise<T> {
  const token = authService.getToken();

  const response = await fetch(url, {
    ...options,
    method: options?.method || 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: formData,
  });

  if (response.status === 401) {
    const isRefreshEndpoint = url.includes(REFRESH_URL);
    if (!isRefreshEndpoint) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        const data = await parseApiErrorFromResponse(response);
        throw apiErrorFromBody(data, 401, data.error || 'Unauthorized');
      }
    }
    handleAuthError(response);
    const data = await parseApiErrorFromResponse(response);
    throw apiErrorFromBody(data, 401, data.error || 'Unauthorized');
  }

  if (response.status === 503) {
    const data = await parseApiErrorFromResponse(response);
    const isServiceUnavailable = data?.code === 'SERVICE_UNAVAILABLE' || data?.service != null;
    if (isServiceUnavailable) {
      window.dispatchEvent(
        new CustomEvent(SERVICE_DEGRADED_EVENT, {
          detail: {
            message: data.error || 'Service temporarily unavailable',
            service: data.service || 'supabase',
          },
        })
      );
    }
    throw apiErrorFromBody(data, 503, data?.error || `HTTP ${response.status}`);
  }

  if (!response.ok) {
    const data = await parseApiErrorFromResponse(response);
    throw apiErrorFromBody(data, response.status, data.error || `HTTP ${response.status}`);
  }

  return response.json();
}
