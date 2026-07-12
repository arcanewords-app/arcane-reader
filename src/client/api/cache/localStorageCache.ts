import {
  CACHE_PREFIX,
  CACHE_SCHEMA_VERSION,
  CACHE_TTL,
  cacheVersionedKey,
} from '../../../shared/cacheContract.js';

export const CATALOG_DEFAULT_LOCAL_KEY = cacheVersionedKey([
  CACHE_PREFIX.publicationsList,
  'catalog-default',
]);

export function getLocalStorageCached<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ts: number; version: string; data: T };
    if (!parsed || parsed.version !== CACHE_SCHEMA_VERSION) return null;
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function setLocalStorageCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    key,
    JSON.stringify({
      version: CACHE_SCHEMA_VERSION,
      ts: Date.now(),
      data,
    })
  );
}

/** Drop cached default catalog list so cover badges refresh after publication metadata changes. */
export function clearCatalogLocalCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CATALOG_DEFAULT_LOCAL_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export const CATALOG_LOCAL_TTL_MS = CACHE_TTL.clientCatalogLocalStorageMs;
