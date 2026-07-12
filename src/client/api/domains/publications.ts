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
    orderBy?: 'published_at' | 'created_at';
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

  /** Get read progress for publication (chapter IDs read + last position). Cached 60s. Returns empty for guests. */
  async getReadProgress(publicationId: string): Promise<{
    chapterIds: string[];
    lastReadChapterId?: string;
    lastReadParagraphIndex?: number;
  }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const cached = getCached(publicationCache.readProgress, cacheKey);
    if (cached) return cached;
    const data = await fetchJsonDeduped<{
      chapterIds: string[];
      lastReadChapterId?: string;
      lastReadParagraphIndex?: number;
    }>(`/api/publications/${publicationId}/read-progress`);
    setCached(publicationCache.readProgress, cacheKey, data);
    return data;
  },

  /** Update reading position (auth required). Invalidates read progress cache. */
  async updateReadingPosition(
    publicationId: string,
    chapterId: string,
    paragraphIndex: number
  ): Promise<{ success: boolean }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const result = await fetchJson<{ success: boolean }>(
      `/api/publications/${publicationId}/reading-position`,
      {
        method: 'PATCH',
        body: JSON.stringify({ chapterId, paragraphIndex }),
      }
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

  /** Mark chapter as read (auth required). Invalidates read progress cache. */
  async markChapterAsRead(publicationId: string, chapterId: string): Promise<{ success: boolean }> {
    const cacheKey = getReadProgressCacheKey(publicationId);
    const result = await fetchJson<{ success: boolean }>(
      `/api/publications/${publicationId}/chapters/${chapterId}/read`,
      { method: 'POST' }
    );
    publicationCache.readProgress.delete(cacheKey);
    emitCacheInvalidation('user');
    return result;
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
