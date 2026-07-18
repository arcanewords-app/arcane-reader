import type {
  ReaderSettings,
  Publication,
  PublicEntity,
  TokenUsage,
  TokenUsageHistory,
} from '../../types.js';
import { authService } from '../../services/authService.js';
import { emitCacheInvalidation } from '../cache/invalidation.js';
import { USER_CACHE_TTL_MS, READING_HISTORY_CACHE_TTL_MS } from '../cache/keys.js';
import { getCached, setCached, userScopedCache } from '../cache/memoryCache.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';
import { fetchFormData } from '../transport/fetchFormData.js';

export const userApi = {
  async getUserReaderSettings(): Promise<ReaderSettings | null> {
    const userId = authService.getCachedUser()?.id ?? 'guest';
    const directEntry = userScopedCache.readerSettings.get(userId);
    if (directEntry && Date.now() - directEntry.ts <= USER_CACHE_TTL_MS) {
      return directEntry.data;
    }
    const data = await fetchJsonDeduped<ReaderSettings | null>(`/api/user/reader-settings`);
    setCached(userScopedCache.readerSettings, userId, data);
    return data;
  },

  /** Update current user's reader settings (auth required). */
  async updateUserReaderSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
    const result = await fetchJson<ReaderSettings>(`/api/user/reader-settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    const userId = authService.getCachedUser()?.id ?? 'guest';
    setCached(userScopedCache.readerSettings, userId, result);
    emitCacheInvalidation('user');
    return result;
  },

  /** Get current user profile (id, email, role, avatarUrl). */
  async getProfile(): Promise<{
    id: string;
    email: string;
    role: string;
    avatarUrl: string | null;
  }> {
    return fetchJson(`/api/user/profile`);
  },

  /** Upload avatar image. Returns new avatarUrl. */
  async uploadAvatar(file: File): Promise<{ avatarUrl: string | null }> {
    const formData = new FormData();
    formData.append('avatar', file);
    return fetchFormData<{ avatarUrl: string | null }>(`/api/user/profile/avatar`, formData, {
      method: 'POST',
    });
  },

  async getUserPublications(): Promise<Publication[]> {
    return fetchJson('/api/user/publications');
  },

  async getTranslatorPseudonyms(params?: { includeHidden?: boolean }): Promise<PublicEntity[]> {
    const q = new URLSearchParams();
    if (params?.includeHidden) q.set('includeHidden', '1');
    const query = q.toString();
    return fetchJson<PublicEntity[]>(`/api/user/translator-pseudonyms${query ? `?${query}` : ''}`);
  },

  async createTranslatorPseudonym(data: {
    name: string;
    description?: string;
    photo?: File;
  }): Promise<PublicEntity> {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.description) formData.append('description', data.description);
    if (data.photo) formData.append('photo', data.photo);
    return fetchFormData<PublicEntity>('/api/user/translator-pseudonyms', formData, {
      method: 'POST',
    });
  },

  async updateTranslatorPseudonym(
    id: string,
    data: { name?: string; description?: string; photo?: File; removePhoto?: boolean }
  ): Promise<PublicEntity> {
    const formData = new FormData();
    if (data.name !== undefined) formData.append('name', data.name);
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.photo) formData.append('photo', data.photo);
    if (data.removePhoto) formData.append('removePhoto', 'true');
    return fetchFormData<PublicEntity>(`/api/user/translator-pseudonyms/${id}`, formData, {
      method: 'PATCH',
    });
  },

  async hideTranslatorPseudonym(id: string): Promise<PublicEntity> {
    return fetchJson<PublicEntity>(`/api/user/translator-pseudonyms/${id}/hide`, {
      method: 'POST',
    });
  },

  async getTokenUsage(date?: string): Promise<TokenUsage> {
    const url = date
      ? `/api/user/token-usage?date=${encodeURIComponent(date)}`
      : '/api/user/token-usage';
    return fetchJsonDeduped(url);
  },

  async getTokenUsageHistory(days: number = 7): Promise<TokenUsageHistory> {
    return fetchJsonDeduped(`/api/user/token-usage/history?days=${days}`);
  },

  /** Get user's reading history (publications with progress). Auth required. */
  async getReadingHistory(): Promise<{
    items: Array<{
      publicationId: string;
      title: string | null;
      coverImageUrl: string | null;
      slug: string | null;
      totalChapters: number;
      readCount: number;
      lastReadChapterNumber: number;
      continueChapterId: string | null;
      lastReadAt: string | null;
    }>;
  }> {
    const userId = authService.getCachedUser()?.id ?? 'guest';
    const cached = getCached(userScopedCache.readingHistory, userId, READING_HISTORY_CACHE_TTL_MS);
    if (cached) return cached;
    const data = await fetchJsonDeduped<{
      items: Array<{
        publicationId: string;
        title: string | null;
        coverImageUrl: string | null;
        slug: string | null;
        totalChapters: number;
        readCount: number;
        lastReadChapterNumber: number;
        continueChapterId: string | null;
        lastReadAt: string | null;
      }>;
    }>('/api/user/reading-history');
    setCached(userScopedCache.readingHistory, userId, data);
    return data;
  },

  async getUserQuotes(): Promise<{
    items: Array<{
      id: string;
      publicationId: string;
      chapterId: string;
      chapterNumber: number;
      quoteText: string;
      startParagraph: number;
      startOffset: number;
      endParagraph: number;
      endOffset: number;
      createdAt: string;
      publicationTitle: string | null;
      publicationSlug: string | null;
      coverImageUrl: string | null;
    }>;
  }> {
    return fetchJson('/api/user/quotes');
  },

  async deleteUserQuote(quoteId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/user/quotes/${quoteId}`, { method: 'DELETE' });
  },
};
