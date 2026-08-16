import type { PublicEntity, PublicEntityKind } from '../../types.js';
import { getCached, setCached, publicationCache } from '../cache/memoryCache.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';

const PUBLIC_ENTITY_IDS_BATCH_SIZE = 50;

export const entitiesApi = {
  async getPublicEntities(params?: {
    kind?: PublicEntityKind;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PublicEntity[]> {
    const searchParams = new URLSearchParams();
    if (params?.kind) searchParams.set('kind', params.kind);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit != null) searchParams.set('limit', String(params.limit));
    if (params?.offset != null) searchParams.set('offset', String(params.offset));
    const q = searchParams.toString();
    return fetchJsonDeduped<PublicEntity[]>(`/api/public/entities${q ? `?${q}` : ''}`);
  },

  /** Get single public entity by id. Cached 2 min. */
  async getPublicEntityById(id: string): Promise<PublicEntity | null> {
    const cached = getCached(publicationCache.publicEntity, id);
    if (cached) return cached;
    try {
      const data = await fetchJsonDeduped<PublicEntity>(`/api/public/entities/${id}`);
      setCached(publicationCache.publicEntity, id, data);
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Batch-fetch public entities by id (chunks of 50).
   * Fills the same in-memory cache as getPublicEntityById.
   */
  async getPublicEntitiesByIds(ids: string[]): Promise<PublicEntity[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];

    const fromCache: PublicEntity[] = [];
    const misses: string[] = [];
    for (const id of unique) {
      const cached = getCached(publicationCache.publicEntity, id);
      if (cached) fromCache.push(cached);
      else misses.push(id);
    }

    if (misses.length === 0) return fromCache;

    const fetched: PublicEntity[] = [];
    for (let i = 0; i < misses.length; i += PUBLIC_ENTITY_IDS_BATCH_SIZE) {
      const chunk = misses.slice(i, i + PUBLIC_ENTITY_IDS_BATCH_SIZE);
      try {
        const data = await fetchJsonDeduped<PublicEntity[]>(
          `/api/public/entities?ids=${chunk.map(encodeURIComponent).join(',')}`
        );
        for (const entity of data) {
          setCached(publicationCache.publicEntity, entity.id, entity);
          fetched.push(entity);
        }
      } catch {
        // Partial failure: return what we have from cache + successful chunks
      }
    }

    return [...fromCache, ...fetched];
  },
};
