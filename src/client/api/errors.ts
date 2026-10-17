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

export const PAYLOAD_TOO_LARGE_CODE = 'PAYLOAD_TOO_LARGE';

export interface ApiErrorObject {
  message?: string;
  code?: string;
}

export interface ApiErrorBody {
  error?: string | ApiErrorObject;
  code?: string;
  service?: string;
  details?: unknown;
  parseErrors?: unknown;
  warnings?: unknown;
}

/** Turn API error fields into text. Objects never become "[object Object]". */
export function coerceErrorText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => coerceErrorText(item))
      .filter((item): item is string => !!item);
    return parts.length > 0 ? parts.join('; ') : undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = coerceErrorText(record.message);
    if (message) return message;
    const nested = coerceErrorText(record.error);
    if (nested) return nested;
    return undefined;
  }
  return undefined;
}

export function isPayloadTooLarge(status: number, code?: string): boolean {
  return (
    status === 413 ||
    code === '413' ||
    code === 'FUNCTION_PAYLOAD_TOO_LARGE' ||
    code === PAYLOAD_TOO_LARGE_CODE
  );
}

export function messageFromApiBody(
  body: ApiErrorBody,
  status: number,
  fallbackMessage: string
): { message: string; code?: string } {
  const nested = body.error;
  const nestedMessage = coerceErrorText(nested);
  const nestedCode =
    nested && typeof nested === 'object' && typeof nested.code === 'string'
      ? nested.code
      : undefined;
  const code = body.code ?? nestedCode;
  if (isPayloadTooLarge(status, code)) {
    return { message: nestedMessage || fallbackMessage, code: PAYLOAD_TOO_LARGE_CODE };
  }
  return { message: nestedMessage || fallbackMessage, code };
}

/** Parse JSON error body from fetch Response or XHR responseText. */
export function parseApiErrorBody(raw: unknown): ApiErrorBody {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
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
  fallbackMessage: unknown
): ApiError {
  const fallback =
    typeof fallbackMessage === 'string' && fallbackMessage.trim()
      ? fallbackMessage
      : `HTTP ${status}`;
  const resolved = messageFromApiBody(body, status, fallback);
  return new ApiError(resolved.message, status, body, resolved.code);
}
