import { CACHE_TTL } from '../../../shared/cacheContract.js';
import { authService } from '../../services/authService.js';

export const PUBLICATION_CACHE_TTL_MS = CACHE_TTL.clientPublicationMs;
export const USER_CACHE_TTL_MS = CACHE_TTL.clientReaderSettingsMs;
export const READING_HISTORY_CACHE_TTL_MS = CACHE_TTL.clientReadingHistoryMs;

export function getReadProgressCacheKey(publicationId: string): string {
  const userId = authService.getCachedUser()?.id ?? 'guest';
  return `${userId}:${publicationId}`;
}

export function makeInFlightKey(url: string, options?: RequestInit): string | null {
  const method = (options?.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  if (options?.signal) return null;
  return `${method}:${url}`;
}
