/**
 * Shared chunk error helpers. Used by engine, server, client for consistent error detection.
 * Keep in sync with engine/constants/errors.ts (engine adds formatChunkError for internal use).
 */

/** Prefix for chunk-level errors in translated/edited text. */
export const CHUNK_ERROR_PREFIX = '[ERROR]';

export function isChunkError(text: string): boolean {
  return (text?.trim() ?? '').startsWith(CHUNK_ERROR_PREFIX);
}
