import { ApiError, apiErrorFromBody, parseApiErrorBody } from '../errors.js';
import type { UploadProgressCallback } from './fetchFormDataWithProgress.js';

/**
 * PUT a file to a Supabase signed upload URL. Bytes never pass through the API function.
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  options?: { signal?: AbortSignal; onProgress?: UploadProgressCallback }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && options?.onProgress) {
        options.onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const data = parseApiErrorBody(xhr.responseText || '{}');
      reject(apiErrorFromBody(data, xhr.status, `HTTP ${xhr.status}`));
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('Network error', 0));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('Request aborted', 0));
    });

    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);

    xhr.open('PUT', signedUrl);
    xhr.send(body);
  });
}
