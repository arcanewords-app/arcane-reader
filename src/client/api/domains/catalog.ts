import type {
  CatalogTranslationRequest,
  BoardTranslationRequest,
  CatalogTranslationRequestInterest,
  CatalogTranslationRequestStatus,
} from '../../types.js';
import { fetchJson } from '../transport/fetchJson.js';

export const catalogApi = {
  async getUserTranslationRequests(): Promise<CatalogTranslationRequest[]> {
    return fetchJson<CatalogTranslationRequest[]>('/api/user/translation-requests');
  },

  async createCatalogTranslationRequest(data: {
    title: string;
    authorName?: string;
    sourceLanguage?: string;
    targetLanguage: string;
    comment?: string;
    sourceUrl?: string;
  }): Promise<CatalogTranslationRequest> {
    return fetchJson<CatalogTranslationRequest>('/api/catalog/translation-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getTranslationRequestsBoard(params?: {
    status?: CatalogTranslationRequestStatus;
    search?: string;
    targetLanguage?: string;
    mine?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<BoardTranslationRequest[]> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.search) search.set('search', params.search);
    if (params?.targetLanguage) search.set('targetLanguage', params.targetLanguage);
    if (params?.mine) search.set('mine', 'true');
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const qs = search.toString();
    return fetchJson<BoardTranslationRequest[]>(
      `/api/translation-requests/board${qs ? `?${qs}` : ''}`
    );
  },

  async createTranslationRequestInterest(
    requestId: string,
    translatorEntityId: string
  ): Promise<CatalogTranslationRequestInterest> {
    return fetchJson<CatalogTranslationRequestInterest>(
      `/api/translation-requests/${requestId}/interests`,
      {
        method: 'POST',
        body: JSON.stringify({ translatorEntityId }),
      }
    );
  },

  async withdrawTranslationRequestInterest(requestId: string): Promise<void> {
    await fetchJson(`/api/translation-requests/${requestId}/interests/me`, {
      method: 'DELETE',
    });
  },
};
