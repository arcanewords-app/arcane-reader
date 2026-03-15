/**
 * Engine error constants and helpers for chunk-level errors.
 * Re-exports from shared for engine use; adds formatChunkError.
 */

import { CHUNK_ERROR_PREFIX, isChunkError } from '../../shared/chunkErrors.js';

export { CHUNK_ERROR_PREFIX, isChunkError };

export function formatChunkError(message: string): string {
  return `${CHUNK_ERROR_PREFIX}: ${message}`;
}
