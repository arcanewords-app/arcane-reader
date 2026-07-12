import type { NewsPost, NewsCategory, ActiveAnnouncement } from '../../types.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';

export const newsApi = {
  async getNewsPosts(params?: {
    limit?: number;
    offset?: number;
    category?: NewsCategory;
  }): Promise<NewsPost[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.offset != null) q.set('offset', String(params.offset));
    if (params?.category) q.set('category', params.category);
    const qs = q.toString();
    return fetchJsonDeduped<NewsPost[]>(`/api/news${qs ? `?${qs}` : ''}`);
  },

  async getNewsPost(idOrSlug: string): Promise<NewsPost> {
    return fetchJsonDeduped<NewsPost>(`/api/news/${encodeURIComponent(idOrSlug)}`);
  },

  async getActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
    return fetchJsonDeduped<ActiveAnnouncement | null>('/api/announcements/active');
  },

  async dismissAnnouncement(id: string, contentVersion: number): Promise<void> {
    await fetchJson(`/api/announcements/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ contentVersion }),
    });
  },
};
