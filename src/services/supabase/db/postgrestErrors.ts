/**
 * PostgREST error helpers — extracted from supabaseDatabase for unit testing.
 */

export interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/** PostgREST "no rows" code — treat as not found */
export function isNotFoundError(error: PostgrestErrorLike | null | undefined): boolean {
  return error?.code === 'PGRST116';
}

export function assertNoError(error: PostgrestErrorLike | null | undefined, context: string): void {
  if (error) {
    throw new Error(`Failed to ${context}: ${error.message ?? 'unknown error'}`);
  }
}

/**
 * Return null when error is not-found; otherwise throw.
 */
export function nullIfNotFound<T>(
  data: T | null,
  error: PostgrestErrorLike | null | undefined,
  context: string
): T | null {
  if (error) {
    if (isNotFoundError(error)) return null;
    throw new Error(`Failed to ${context}: ${error.message ?? 'unknown error'}`);
  }
  return data;
}
