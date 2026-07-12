import type { PublicEntity, PublicEntityKind } from '../../types.js';
import { getCached, setCached, publicationCache } from '../cache/memoryCache.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';

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
};
