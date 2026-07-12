/**
 * API error types and response body parsing.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiErrorBody {
  error?: string;
  code?: string;
  service?: string;
}

/** Parse JSON error body from fetch Response or XHR responseText. */
export function parseApiErrorBody(raw: unknown): ApiErrorBody {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw as ApiErrorBody;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ApiErrorBody;
    } catch {
      return {};
    }
  }
  return {};
}

export async function parseApiErrorFromResponse(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return {};
  }
}

export function apiErrorFromBody(
  body: ApiErrorBody,
  status: number,
  fallbackMessage: string
): ApiError {
  return new ApiError(body.error || fallbackMessage, status, body, body.code);
}
