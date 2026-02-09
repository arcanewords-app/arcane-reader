/**
 * Arcane Reader - API Client
 * Typed fetch wrapper for REST API communication
 */

import { authService } from '../services/authService';
import type {
  SystemStatus,
  Project,
  ProjectListItem,
  ProjectMetadata,
  ProjectSettings,
  ReaderSettings,
  Chapter,
  ChapterStats,
  GlossaryEntry,
  Paragraph,
  TranslateResponse,
  BulkUpdateResponse,
  ChapterTranslationOptions,
  TokenUsage,
  TokenUsageHistory,
  Publication,
  PublicationListItem,
  PublicationWithChapters,
} from '../types';

// === API Error ===

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// === Fetch Helpers ===

/**
 * Custom event name for authentication errors
 */
const AUTH_ERROR_EVENT = 'arcane:auth-error';

/**
 * Helper to handle 401 errors consistently
 * Clears auth storage, dispatches event for app to handle, and redirects if needed
 */
function handleAuthError(response: Response): void {
  if (response.status === 401) {
    // Clear auth storage
    authService.clearStorage();

    // Dispatch custom event to notify app about auth error
    // This allows App.tsx to update state and show login without full page reload
    window.dispatchEvent(
      new CustomEvent(AUTH_ERROR_EVENT, {
        detail: { message: 'Токен истек. Пожалуйста, войдите снова.' },
      })
    );

    // Redirect to login page if not already there
    if (window.location.pathname !== '/') {
      window.location.href = '/?login=required';
    } else {
      // Update URL to include login=required parameter
      const url = new URL(window.location.href);
      url.searchParams.set('login', 'required');
      window.history.replaceState({}, '', url.toString());
    }
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  // Get token from authService
  const token = authService.getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  // Handle 401 - unauthorized (token expired or invalid)
  if (response.status === 401) {
    handleAuthError(response);
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Unauthorized', 401, data);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status, data);
  }

  return response.json();
}

/**
 * Fetch helper for FormData requests (multipart/form-data)
 * Does not set Content-Type header (browser will set it with boundary)
 */
async function fetchFormData<T>(
  url: string,
  formData: FormData,
  options?: RequestInit
): Promise<T> {
  // Get token from authService
  const token = authService.getToken();

  const response = await fetch(url, {
    ...options,
    method: options?.method || 'POST',
    headers: {
      // Do not set Content-Type - browser will set it with boundary for FormData
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: formData,
  });

  // Handle 401 - unauthorized (token expired or invalid)
  if (response.status === 401) {
    handleAuthError(response);
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Unauthorized', 401, data);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status, data);
  }

  return response.json();
}

// === API Client ===

export const api = {
  // === System ===

  async getStatus(): Promise<SystemStatus> {
    return fetchJson('/api/status');
  },

  // === Projects ===

  async getProjects(): Promise<ProjectListItem[]> {
    return fetchJson('/api/projects');
  },

  async getProject(id: string): Promise<Project> {
    return fetchJson(`/api/projects/${id}`);
  },

  async createProject(name: string): Promise<Project> {
    return fetchJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async updateProjectMetadata(
    projectId: string,
    metadata: Partial<ProjectMetadata>
  ): Promise<Project> {
    return fetchJson(`/api/projects/${projectId}/metadata`, {
      method: 'PUT',
      body: JSON.stringify({ metadata }),
    });
  },

  async updateSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<ProjectSettings> {
    return fetchJson(`/api/projects/${projectId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async getReaderSettings(projectId: string): Promise<ReaderSettings> {
    return fetchJson(`/api/projects/${projectId}/settings/reader`);
  },

  async updateReaderSettings(
    projectId: string,
    settings: Partial<ReaderSettings>
  ): Promise<ReaderSettings> {
    return fetchJson(`/api/projects/${projectId}/settings/reader`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // === Chapters ===

  async uploadChapter(
    projectId: string,
    file: File,
    title: string,
    signal?: AbortSignal
  ): Promise<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    // Send actual filename so server gets correct UTF-8 name (avoids multipart encoding issues with Cyrillic, etc.)
    formData.append('filename', file.name);

    return fetchFormData<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }>(
      `/api/projects/${projectId}/chapters`,
      formData,
      { method: 'POST', signal }
    );
  },

  async getChapter(projectId: string, chapterId: string): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}`);
  },

  /** Lightweight: only chapter status (for polling during translation) */
  async getChapterStatus(
    projectId: string,
    chapterId: string
  ): Promise<{ status: Chapter['status'] }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/status`);
  },

  async deleteChapter(projectId: string, chapterId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },

  async updateChapterTitle(projectId: string, chapterId: string, title: string): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });
  },

  async updateChapterNumber(
    projectId: string,
    chapterId: string,
    number: number
  ): Promise<Project> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/number`, {
      method: 'PUT',
      body: JSON.stringify({ number }),
    });
  },

  async reorderChapters(projectId: string, ids: string[]): Promise<Project> {
    return fetchJson(`/api/projects/${projectId}/chapters/order`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    });
  },

  async cancelTranslation(projectId: string, chapterId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/translate/cancel`, {
      method: 'POST',
    });
  },

  async uploadChapterTranslation(
    projectId: string,
    chapterId: string,
    translatedText: string
  ): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/upload-translation`, {
      method: 'POST',
      body: JSON.stringify({ translatedText }),
    });
  },

  async markChapterAsTranslated(projectId: string, chapterId: string): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/mark-as-translated`, {
      method: 'POST',
    });
  },

  async getChapterStats(projectId: string, chapterId: string): Promise<ChapterStats> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/stats`);
  },

  async translateChapter(
    projectId: string,
    chapterId: string,
    options?: ChapterTranslationOptions
  ): Promise<TranslateResponse> {
    const body: ChapterTranslationOptions = {};
    if (options?.translateOnlyEmpty !== undefined) {
      body.translateOnlyEmpty = options.translateOnlyEmpty;
    }
    if (options?.paragraphIds?.length) {
      body.paragraphIds = options.paragraphIds;
    }
    if (options?.stages !== undefined) {
      body.stages = options.stages;
    }
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/translate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // === Paragraphs ===

  async updateParagraph(
    projectId: string,
    chapterId: string,
    paragraphId: string,
    updates: Partial<Pick<Paragraph, 'translatedText' | 'status'>>
  ): Promise<Paragraph> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/paragraphs/${paragraphId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async bulkUpdateParagraphs(
    projectId: string,
    chapterId: string,
    paragraphIds: string[],
    status: string
  ): Promise<BulkUpdateResponse> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/paragraphs/bulk-status`, {
      method: 'POST',
      body: JSON.stringify({ paragraphIds, status }),
    });
  },

  // === Glossary ===

  async getGlossary(projectId: string): Promise<GlossaryEntry[]> {
    return fetchJson(`/api/projects/${projectId}/glossary`);
  },

  async addGlossary(projectId: string, entry: Omit<GlossaryEntry, 'id'>): Promise<GlossaryEntry> {
    return fetchJson(`/api/projects/${projectId}/glossary`, {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  async updateGlossaryEntry(
    projectId: string,
    entryId: string,
    data: Partial<GlossaryEntry>
  ): Promise<GlossaryEntry> {
    return fetchJson(`/api/projects/${projectId}/glossary/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGlossaryEntry(projectId: string, entryId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/glossary/${entryId}`, {
      method: 'DELETE',
    });
  },

  /** Get LLM suggestions for merging duplicate/alias glossary entries */
  async suggestGlossaryMerges(projectId: string): Promise<{
    suggestions: Array<{ entryIds: string[]; reason: string; suggestedPrimaryId?: string }>;
  }> {
    return fetchJson(`/api/projects/${projectId}/glossary/suggest-merges`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /** Merge multiple glossary entries into one (keeps one, merges fields, deletes others) */
  async mergeGlossaryEntries(
    projectId: string,
    body: { entryIds: string[]; keepEntryId?: string }
  ): Promise<{ kept: GlossaryEntry; deletedCount: number }> {
    return fetchJson(`/api/projects/${projectId}/glossary/merge`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async uploadGlossaryImage(
    projectId: string,
    entryId: string,
    file: File
  ): Promise<{ imageUrl: string; imageUrls: string[]; entry: GlossaryEntry }> {
    const formData = new FormData();
    formData.append('image', file);

    return fetchFormData<{ imageUrl: string; imageUrls: string[]; entry: GlossaryEntry }>(
      `/api/projects/${projectId}/glossary/${entryId}/image`,
      formData
    );
  },

  async deleteGlossaryImage(
    projectId: string,
    entryId: string,
    imageIndex?: number
  ): Promise<{ success: boolean; imageUrls?: string[] }> {
    const url =
      imageIndex !== undefined
        ? `/api/projects/${projectId}/glossary/${entryId}/image/${imageIndex}`
        : `/api/projects/${projectId}/glossary/${entryId}/image`;

    return fetchJson(url, {
      method: 'DELETE',
    });
  },

  // === Project Cover Image ===

  async uploadProjectCover(
    projectId: string,
    file: File
  ): Promise<{ coverImageUrl: string; project: Project }> {
    const formData = new FormData();
    formData.append('image', file);

    return fetchFormData<{ coverImageUrl: string; project: Project }>(
      `/api/projects/${projectId}/cover`,
      formData
    );
  },

  async deleteProjectCover(projectId: string): Promise<{ success: boolean; project: Project }> {
    return fetchJson(`/api/projects/${projectId}/cover`, {
      method: 'DELETE',
    });
  },

  // === Export ===

  async exportProject(
    projectId: string,
    format: 'epub' | 'fb2',
    author?: string
  ): Promise<{
    success: boolean;
    format: string;
    filename: string;
    url: string;
    path: string;
    downloadUrl?: string;
  }> {
    return fetchJson(`/api/projects/${projectId}/export`, {
      method: 'POST',
      body: JSON.stringify({ format, author }),
    });
  },

  // === Publications (public catalog) ===

  /** List published publications (public, no auth required) */
  async getPublications(params?: {
    limit?: number;
    offset?: number;
    orderBy?: 'published_at' | 'created_at';
    orderAsc?: boolean;
  }): Promise<PublicationListItem[]> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    if (params?.orderBy) search.set('orderBy', params.orderBy);
    if (params?.orderAsc) search.set('orderAsc', String(params.orderAsc));
    const q = search.toString();
    return fetchJson(`/api/publications${q ? `?${q}` : ''}`);
  },

  /** Get single publication (public) */
  async getPublication(id: string): Promise<Publication> {
    return fetchJson(`/api/publications/${id}`);
  },

  /** Get publication with chapters list (public, for reading page) */
  async getPublicationWithChapters(id: string): Promise<PublicationWithChapters> {
    const result = await fetchJson<{
      publication: Publication;
      chapters: PublicationWithChapters['chapters'];
      glossaryCount: number;
    }>(`/api/publications/${id}/chapters`);
    return {
      ...result.publication,
      chapters: result.chapters,
      glossaryCount: result.glossaryCount,
    };
  },

  /** Get publication glossary (public, read-only). Returns empty array if not published. */
  async getPublicationGlossary(publicationId: string): Promise<GlossaryEntry[]> {
    return fetchJson(`/api/publications/${publicationId}/glossary`);
  },

  /** Get single chapter content for public reading (translated text only) */
  async getPublicationChapter(
    publicationId: string,
    chapterId: string
  ): Promise<{ id: string; number: number; title: string; translatedText: string }> {
    return fetchJson(`/api/publications/${publicationId}/chapters/${chapterId}`);
  },

  /** Publish project (auth required) */
  async publishProject(
    projectId: string,
    data: {
      status?: 'draft' | 'published';
      title?: string | null;
      description?: string | null;
      coverImageUrl?: string | null;
      authorDisplay?: string | null;
      translatorDisplay?: string | null;
    }
  ): Promise<Publication> {
    return fetchJson(`/api/projects/${projectId}/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Unpublish project (auth required) */
  async unpublishProject(projectId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/publish`, {
      method: 'DELETE',
    });
  },

  /** Get current user's publications (auth required) */
  async getUserPublications(): Promise<Publication[]> {
    return fetchJson('/api/user/publications');
  },

  /** Get publication for a project (owner, auth required). Returns null when project has no publication yet. */
  async getProjectPublication(projectId: string): Promise<Publication | null> {
    const result = await fetchJson<Publication | null>(`/api/projects/${projectId}/publication`);
    return result ?? null;
  },

  // === Token Usage ===

  async getTokenUsage(date?: string): Promise<TokenUsage> {
    const url = date
      ? `/api/user/token-usage?date=${encodeURIComponent(date)}`
      : '/api/user/token-usage';
    return fetchJson(url);
  },

  async getTokenUsageHistory(days: number = 7): Promise<TokenUsageHistory> {
    return fetchJson(`/api/user/token-usage/history?days=${days}`);
  },
};

export default api;
