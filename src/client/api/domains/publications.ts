import type {
  PublicationListItem,
  Publication,
  PublicationWithChapters,
  GlossaryEntry,
} from '../../types.js';
import { authService } from '../../services/authService.js';
import {
  getCachedCatalogList,
  isDefaultCatalogRequest,
  setCachedCatalogList,
} from '../cache/catalogCache.js';
import { emitCacheInvalidation } from '../cache/invalidation.js';
import { getReadProgressCacheKey } from '../cache/keys.js';
import { getCached, setCached, publicationCache } from '../cache/memoryCache.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';
import { downloadBlob } from '../transport/downloadBlob.js';

export const publicationsApi = {
  /** List published publications (public, no auth required) */
  async getPublications(params?: {
    limit?: number;
    offset?: number;
    orderBy?: 'published_at' | 'created_at' | 'rating';
    orderAsc?: boolean;
    authorEntityId?: string;
    translatorEntityId?: string;
    tagEntityId?: string;
  }): Promise<PublicationListItem[]> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    if (params?.orderBy) search.set('orderBy', params.orderBy);
    if (params?.orderAsc) search.set('orderAsc', String(params.orderAsc));
    if (params?.authorEntityId) search.set('author', params.authorEntityId);
    if (params?.translatorEntityId) search.set('translator', params.translatorEntityId);
    if (params?.tagEntityId) search.set('tag', params.tagEntityId);
    const q = search.toString();
    const requestUrl = `/api/publications${q ? `?${q}` : ''}`;
    if (isDefaultCatalogRequest(params)) {
      const local = getCachedCatalogList();
      if (local) return local;
    }
    const data = await fetchJsonDeduped<PublicationListItem[]>(requestUrl);
    if (isDefaultCatalogRequest(params)) {
      setCachedCatalogList(data);
    }
    return data;
  },

  /** Get single publication (public) */
  async getPublication(id: string): Promise<Publication> {
    return fetchJsonDeduped(`/api/publications/${id}`);
  },

  /** Get publication with chapters list (public, for reading page). Cached 60s to avoid duplicates on navigation. */
  async getPublicationWithChapters(id: string): Promise<PublicationWithChapters> {
    const cached = getCached(publicationCache.withChapters, id);
    if (cached) return cached;
    const result = await fetchJsonDeduped<{
      publication: Publication;
      chapters: PublicationWithChapters['chapters'];
      glossaryCount: number;
    }>(`/api/publications/${id}/chapters`);
    const data: PublicationWithChapters = {
      ...result.publication,
      chapters: result.chapters,
      glossaryCount: result.glossaryCount,
    };
    setCached(publicationCache.withChapters, id, data);
    return data;
  },

  /** Get publication glossary (public, read-only). Cached 60s. Returns empty array if not published. */
  async getPublicationGlossary(publicationId: string): Promise<GlossaryEntry[]> {
    const cached = getCached(publicationCache.glossary, publicationId);
    if (cached) return cached;
    const data = await fetchJsonDeduped<GlossaryEntry[]>(
      `/api/publications/${publicationId}/glossary`
    );
    setCached(publicationCache.glossary, publicationId, data);
    return data;
  },

  /** Get read progress watermark for publication. Cached 60s. Returns 0 for guests. */
  async getReadProgress(publicationId: string): Promise<{ lastReadChapterNumber: number }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const cached = getCached(publicationCache.readProgress, cacheKey);
    if (cached) return cached;
    const data = await fetchJsonDeduped<{ lastReadChapterNumber: number }>(
      `/api/publications/${publicationId}/read-progress`
    );
    setCached(publicationCache.readProgress, cacheKey, data);
    return data;
  },

  /** Update read progress watermark (auth required). */
  async updateReadProgress(
    publicationId: string,
    chapterNumber: number,
    mode: 'complete' | 'set'
  ): Promise<{ lastReadChapterNumber: number }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const result = await fetchJson<{ lastReadChapterNumber: number }>(
      `/api/publications/${publicationId}/read-progress`,
      {
        method: 'PATCH',
        body: JSON.stringify({ chapterNumber, mode }),
      }
    );
    publicationCache.readProgress.delete(cacheKey);
    emitCacheInvalidation('user');
    return result;
  },

  /** Reset read progress (auth required). */
  async resetReadProgress(publicationId: string): Promise<{ lastReadChapterNumber: number }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const result = await fetchJson<{ lastReadChapterNumber: number }>(
      `/api/publications/${publicationId}/read-progress`,
      { method: 'DELETE' }
    );
    publicationCache.readProgress.delete(cacheKey);
    emitCacheInvalidation('user');
    return result;
  },

  /** Build publication exports (EPUB/FB2) once and save to publication. Author only. */
  async buildPublicationExports(
    publicationId: string,
    formats?: ('epub' | 'fb2')[]
  ): Promise<{ epubReady: boolean; fb2Ready: boolean }> {
    const result = await fetchJson<{ epubReady: boolean; fb2Ready: boolean }>(
      `/api/publications/${publicationId}/build-exports`,
      {
        method: 'POST',
        body: JSON.stringify({ formats: formats ?? ['epub', 'fb2'] }),
      }
    );
    publicationCache.withChapters.delete(publicationId);
    return result;
  },

  /** Update publication display settings (showGlossary). Author only. */
  async updatePublicationDisplaySettings(
    publicationId: string,
    data: { showGlossary?: boolean }
  ): Promise<{ success: boolean }> {
    const result = await fetchJson<{ success: boolean }>(`/api/publications/${publicationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    publicationCache.withChapters.delete(publicationId);
    publicationCache.glossary.delete(publicationId);
    return result;
  },

  /** Download built publication export (user+ required). Fetches with auth and triggers browser download. */
  async downloadPublicationExport(
    publicationId: string,
    format: 'epub' | 'fb2'
  ): Promise<{ filename: string }> {
    return downloadBlob(`/api/publications/${publicationId}/download?format=${format}`, {
      token: authService.getToken(),
      fallbackFilename: `book.${format}`,
      failureMessage: 'Download failed',
    });
  },

  /** @deprecated Use updateReadProgress with mode complete */
  async markChapterAsRead(
    publicationId: string,
    chapterId: string,
    chapterNumber: number
  ): Promise<{ lastReadChapterNumber: number }> {
    return this.updateReadProgress(publicationId, chapterNumber, 'complete');
  },

  /** Report translation issue (public, optional auth). */
  async reportTranslation(
    publicationId: string,
    chapterId: string,
    description: string
  ): Promise<{ success: boolean; id: string }> {
    return fetchJson<{ success: boolean; id: string }>(
      `/api/publications/${publicationId}/report`,
      {
        method: 'POST',
        body: JSON.stringify({ chapterId, description }),
      }
    );
  },

  async getPublicationRatingStatus(publicationId: string): Promise<{
    userScore: number | null;
    eligibility: 'eligible' | 'guest' | 'owner' | 'not_read' | 'not_found';
  }> {
    return fetchJsonDeduped(`/api/publications/${publicationId}/rating`);
  },

  async upsertPublicationRating(publicationId: string, score: number): Promise<{ score: number }> {
    const result = await fetchJson<{ score: number }>(`/api/publications/${publicationId}/rating`, {
      method: 'PUT',
      body: JSON.stringify({ score }),
    });
    emitCacheInvalidation('catalog');
    publicationCache.withChapters.delete(publicationId);
    return result;
  },

  async deletePublicationRating(publicationId: string): Promise<{ success: boolean }> {
    const result = await fetchJson<{ success: boolean }>(
      `/api/publications/${publicationId}/rating`,
      { method: 'DELETE' }
    );
    emitCacheInvalidation('catalog');
    publicationCache.withChapters.delete(publicationId);
    return result;
  },

  /** Get single chapter content for public reading (translated text only). Cached 2 min. */
  async getPublicationChapter(
    publicationId: string,
    chapterId: string,
    signal?: AbortSignal
  ): Promise<{ id: string; number: number; title: string; translatedText: string }> {
    const cacheKey = `${publicationId}:${chapterId}`;
    if (!signal) {
      const cached = getCached(publicationCache.chapterContent, cacheKey);
      if (cached) return cached;
    }
    const data = await fetchJsonDeduped<{
      id: string;
      number: number;
      title: string;
      translatedText: string;
    }>(`/api/publications/${publicationId}/chapters/${chapterId}`, { signal });
    if (!signal) setCached(publicationCache.chapterContent, cacheKey, data);
    return data;
  },
};
