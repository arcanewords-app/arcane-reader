import type { PublicationListItem } from '../../types.js';
import {
  CATALOG_DEFAULT_LOCAL_KEY,
  CATALOG_LOCAL_TTL_MS,
  getLocalStorageCached,
  setLocalStorageCached,
} from './localStorageCache.js';

export interface CatalogListParams {
  limit?: number;
  offset?: number;
  orderBy?: 'published_at' | 'created_at';
  orderAsc?: boolean;
  authorEntityId?: string;
  translatorEntityId?: string;
  tagEntityId?: string;
}

export function isDefaultCatalogRequest(params?: CatalogListParams): boolean {
  const hasEntityFilter =
    Boolean(params?.authorEntityId) ||
    Boolean(params?.translatorEntityId) ||
    Boolean(params?.tagEntityId);
  return (
    !hasEntityFilter &&
    (params?.limit ?? 50) === 50 &&
    (params?.offset ?? 0) === 0 &&
    (params?.orderBy ?? 'published_at') === 'published_at' &&
    (params?.orderAsc ?? false) === false
  );
}

export function getCachedCatalogList(): PublicationListItem[] | null {
  return getLocalStorageCached<PublicationListItem[]>(
    CATALOG_DEFAULT_LOCAL_KEY,
    CATALOG_LOCAL_TTL_MS
  );
}

export function setCachedCatalogList(data: PublicationListItem[]): void {
  setLocalStorageCached(CATALOG_DEFAULT_LOCAL_KEY, data);
}
