import type { NewsPost, NewsCategory, ActiveAnnouncement } from '../../types.js';
import { APP_LOCALE_KEY, isAppLocale, PRIMARY_CONTENT_LOCALE } from '../../../shared/appLocales.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';

function requestLocale(): string {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(APP_LOCALE_KEY);
    if (saved && isAppLocale(saved)) return saved;
  }
  if (typeof navigator !== 'undefined') {
    const codes =
      navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
    for (const raw of codes) {
      if (!raw) continue;
      const base = raw.split('-')[0]?.toLowerCase() ?? '';
      if (isAppLocale(base)) return base;
    }
  }
  return PRIMARY_CONTENT_LOCALE;
}

export const newsApi = {
  async getNewsPosts(params?: {
    limit?: number;
    offset?: number;
    category?: NewsCategory;
  }): Promise<NewsPost[]> {
    const q = new URLSearchParams();
    q.set('locale', requestLocale());
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.offset != null) q.set('offset', String(params.offset));
    if (params?.category) q.set('category', params.category);
    return fetchJsonDeduped<NewsPost[]>(`/api/news?${q.toString()}`);
  },

  async getNewsPost(idOrSlug: string): Promise<NewsPost> {
    const q = new URLSearchParams({ locale: requestLocale() });
    return fetchJsonDeduped<NewsPost>(`/api/news/${encodeURIComponent(idOrSlug)}?${q.toString()}`);
  },

  async getActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
    const q = new URLSearchParams({ locale: requestLocale() });
    return fetchJsonDeduped<ActiveAnnouncement | null>(`/api/announcements/active?${q.toString()}`);
  },

  async dismissAnnouncement(id: string, contentVersion: number): Promise<void> {
    await fetchJson(`/api/announcements/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ contentVersion }),
    });
  },
};
