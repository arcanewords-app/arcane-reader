import { authService } from '../../services/authService.js';
import { ApiError, apiErrorFromBody, parseApiErrorBody } from '../errors.js';
import { handleAuthError, tryRefresh } from './fetchJson.js';

/** Progress callback for upload: loaded and total bytes */
export type UploadProgressCallback = (loaded: number, total: number) => void;

const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';

/**
 * Upload FormData with progress tracking (uses XMLHttpRequest for upload.onprogress).
 * fetch() does not support upload progress events.
 */
export function fetchFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  options?: { signal?: AbortSignal; onProgress?: UploadProgressCallback }
): Promise<T> {
  const token = authService.getToken();
  const method = 'POST';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && options?.onProgress) {
        options.onProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        tryRefresh().then((refreshed) => {
          if (refreshed) {
            reject(new ApiError('Unauthorized', 401, undefined, undefined));
          } else {
            handleAuthError({ status: 401 } as Response);
            const data = parseApiErrorBody(xhr.responseText || '{}');
            reject(apiErrorFromBody(data, 401, data.error || 'Unauthorized'));
          }
        });
        return;
      }
      if (xhr.status === 503) {
        try {
          const data = parseApiErrorBody(xhr.responseText || '{}');
          window.dispatchEvent(
            new CustomEvent(SERVICE_DEGRADED_EVENT, {
              detail: {
                message: data.error || 'Service temporarily unavailable',
                service: data.service || 'supabase',
              },
            })
          );
        } catch {
          // ignore parse error
        }
        reject(new ApiError(`HTTP ${xhr.status}`, 503));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve(data as T);
        } catch {
          reject(new ApiError('Invalid JSON response', xhr.status));
        }
      } else {
        const data = parseApiErrorBody(xhr.responseText || '{}');
        reject(apiErrorFromBody(data, xhr.status, data.error || `HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('Network error', 0));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('Request aborted', 0));
    });

    xhr.open(method, url);
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}
