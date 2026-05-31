/**
 * Arcane Reader - API Client
 * Typed fetch wrapper for REST API communication
 */

import { AUTH_CHANGED_EVENT, authService } from '../services/authService';
import {
  CACHE_PREFIX,
  CACHE_TTL,
  CACHE_SCHEMA_VERSION,
  cacheVersionedKey,
} from '../../shared/cacheContract';
import type {
  SystemStatus,
  Project,
  ProjectWithChapterList,
  ProjectListItem,
  ProjectMetadata,
  ProjectSettings,
  ReaderSettings,
  Chapter,
  ChapterSummary,
  ChapterStats,
  ProjectSearchMatch,
  GlossaryEntry,
  Paragraph,
  TranslateResponse,
  ChapterTranslationOptions,
  ImportJobState,
  AnalysisJobState,
  TranslateJobState,
  ProjectJobsResponse,
  MarkTranslatedBatchResponse,
  TokenUsage,
  TokenUsageHistory,
  Publication,
  PublicationListItem,
  PublicationWithChapters,
  PublicEntity,
  PublicEntityKind,
} from '../types';

// === API Error ===

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
    public code?: string
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
 * Custom event name for service unavailability (503)
 */
const SERVICE_DEGRADED_EVENT = 'arcane:service-degraded';

const REFRESH_URL = '/api/auth/refresh';

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

/** Shared refresh promise so concurrent 401s wait for the same refresh */
let refreshPromise: Promise<boolean> | null = null;

/** Publication data cache (60s TTL) — avoids duplicate fetches when navigating PublicationPage → PublicationReadingPage */
const PUBLICATION_CACHE_TTL_MS = CACHE_TTL.clientPublicationMs;
const USER_CACHE_TTL_MS = CACHE_TTL.clientReaderSettingsMs;
const READING_HISTORY_CACHE_TTL_MS = CACHE_TTL.clientReadingHistoryMs;

type InFlightCacheValue = Promise<unknown>;
const inFlightGetRequests = new Map<string, InFlightCacheValue>();

interface PublicationCacheEntry<T> {
  data: T;
  ts: number;
}

const publicationCache = {
  withChapters: new Map<string, PublicationCacheEntry<PublicationWithChapters>>(),
  readProgress: new Map<
    string,
    PublicationCacheEntry<{
      chapterIds: string[];
      lastReadChapterId?: string;
      lastReadParagraphIndex?: number;
    }>
  >(),
  glossary: new Map<string, PublicationCacheEntry<GlossaryEntry[]>>(),
  chapterContent: new Map<
    string,
    PublicationCacheEntry<{ id: string; number: number; title: string; translatedText: string }>
  >(),
  publicEntity: new Map<string, PublicationCacheEntry<PublicEntity>>(),
};

const userScopedCache = {
  readerSettings: new Map<string, PublicationCacheEntry<ReaderSettings | null>>(),
  readingHistory: new Map<
    string,
    PublicationCacheEntry<{
      items: Array<{
        publicationId: string;
        title: string | null;
        coverImageUrl: string | null;
        slug: string | null;
        totalChapters: number;
        readCount: number;
        lastReadChapterId: string | null;
        lastReadAt: string | null;
      }>;
    }>
  >(),
};

const CACHE_INVALIDATION_EVENT = 'arcane:cache-invalidate';
const CACHE_INVALIDATION_KEY = 'arcane.cache.invalidate';
const cacheChannel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(CACHE_INVALIDATION_EVENT)
    : null;

type CacheScope = 'user';

function makeInFlightKey(url: string, options?: RequestInit): string | null {
  const method = (options?.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  if (options?.signal) return null;
  return `${method}:${url}`;
}

async function fetchJsonDeduped<T>(url: string, options?: RequestInit): Promise<T> {
  const dedupeKey = makeInFlightKey(url, options);
  if (!dedupeKey) return fetchJson<T>(url, options);
  const existing = inFlightGetRequests.get(dedupeKey);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = fetchJson<T>(url, options).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });
  inFlightGetRequests.set(dedupeKey, promise);
  return promise;
}

function clearUserScopedCaches(): void {
  publicationCache.readProgress.clear();
  userScopedCache.readerSettings.clear();
  userScopedCache.readingHistory.clear();
}

function emitCacheInvalidation(scope: CacheScope): void {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({ scope, ts: Date.now(), version: CACHE_SCHEMA_VERSION });
  cacheChannel?.postMessage(payload);
  localStorage.setItem(CACHE_INVALIDATION_KEY, payload);
}

function getLocalStorageCached<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { ts: number; version: string; data: T };
    if (!parsed || parsed.version !== CACHE_SCHEMA_VERSION) return null;
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setLocalStorageCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    key,
    JSON.stringify({
      version: CACHE_SCHEMA_VERSION,
      ts: Date.now(),
      data,
    })
  );
}

function getReadProgressCacheKey(publicationId: string): string {
  const userId = authService.getCachedUser()?.id ?? 'guest';
  return `${userId}:${publicationId}`;
}

function getCached<T>(
  map: Map<string, PublicationCacheEntry<T>>,
  key: string,
  ttlMs = PUBLICATION_CACHE_TTL_MS
): T | null {
  const entry = map.get(key);
  if (!entry || Date.now() - entry.ts > ttlMs) return null;
  return entry.data;
}

function setCached<T>(map: Map<string, PublicationCacheEntry<T>>, key: string, data: T): void {
  map.set(key, { data, ts: Date.now() });
}

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    clearUserScopedCaches();
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== CACHE_INVALIDATION_KEY || !event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue) as { scope?: CacheScope };
      if (payload.scope === 'user') {
        clearUserScopedCaches();
      }
    } catch {
      // ignore invalid payload
    }
  });

  cacheChannel?.addEventListener('message', (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { scope?: CacheScope };
      if (payload.scope === 'user') {
        clearUserScopedCaches();
      }
    } catch {
      // ignore invalid payload
    }
  });
}

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = authService.refresh();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function fetchJson<T>(url: string, options?: RequestInit, isRetry = false): Promise<T> {
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

  // Handle 401 - try refresh first (except for refresh endpoint and retries)
  if (response.status === 401) {
    const isRefreshEndpoint = url.includes(REFRESH_URL);
    if (!isRefreshEndpoint && !isRetry) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return fetchJson<T>(url, options, true);
      }
    }
    handleAuthError(response);
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Unauthorized', 401, data, data.code);
  }

  // Handle 503 - service unavailable (Supabase/infrastructure)
  if (response.status === 503) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      service?: string;
    };
    const isServiceUnavailable = data?.code === 'SERVICE_UNAVAILABLE' || data?.service != null;
    if (isServiceUnavailable) {
      window.dispatchEvent(
        new CustomEvent(SERVICE_DEGRADED_EVENT, {
          detail: {
            message: data.error || 'Service temporarily unavailable',
            service: data.service || 'supabase',
          },
        })
      );
    }
    throw new ApiError(data?.error || `HTTP ${response.status}`, 503, data, data?.code);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status, data);
  }

  return response.json();
}

/** Progress callback for upload: loaded and total bytes */
export type UploadProgressCallback = (loaded: number, total: number) => void;

/**
 * Upload FormData with progress tracking (uses XMLHttpRequest for upload.onprogress).
 * fetch() does not support upload progress events.
 */
function fetchFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  options?: { signal?: AbortSignal; onProgress?: UploadProgressCallback }
): Promise<T> {
  const token = authService.getToken();
  const method = 'POST';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && options?.onProgress) {
        options.onProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        tryRefresh().then((refreshed) => {
          if (refreshed) {
            reject(new ApiError('Unauthorized', 401, undefined, undefined));
          } else {
            handleAuthError({ status: 401 } as Response);
            try {
              const data = JSON.parse(xhr.responseText || '{}');
              reject(new ApiError(data.error || 'Unauthorized', 401, data, data.code));
            } catch {
              reject(new ApiError('Unauthorized', 401));
            }
          }
        });
        return;
      }
      if (xhr.status === 503) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          window.dispatchEvent(
            new CustomEvent(SERVICE_DEGRADED_EVENT, {
              detail: {
                message: data.error || 'Service temporarily unavailable',
                service: data.service || 'supabase',
              },
            })
          );
        } catch {
          // ignore parse error
        }
        reject(new ApiError(`HTTP ${xhr.status}`, 503));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve(data as T);
        } catch {
          reject(new ApiError('Invalid JSON response', xhr.status));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          reject(new ApiError(data.error || `HTTP ${xhr.status}`, xhr.status, data));
        } catch {
          reject(new ApiError(`HTTP ${xhr.status}`, xhr.status));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('Network error', 0));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('Request aborted', 0));
    });

    xhr.open(method, url);
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}

/**
 * Fetch helper for FormData requests (multipart/form-data)
 * Does not set Content-Type header (browser will set it with boundary)
 * Note: FormData body is consumed on send, so we cannot retry. On 401 we try refresh;
 * if refresh succeeds we throw ApiError (token is fresh, user can retry the action).
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

  // Handle 401 - try refresh first (FormData cannot be retried, but token will be fresh for user retry)
  if (response.status === 401) {
    const isRefreshEndpoint = url.includes(REFRESH_URL);
    if (!isRefreshEndpoint) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        // Token is fresh; throw so caller can retry the action
        const data = await response.json().catch(() => ({}));
        throw new ApiError(data.error || 'Unauthorized', 401, data, data.code);
      }
    }
    handleAuthError(response);
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'Unauthorized', 401, data, data.code);
  }

  // Handle 503 - service unavailable (Supabase/infrastructure)
  if (response.status === 503) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      service?: string;
    };
    const isServiceUnavailable = data?.code === 'SERVICE_UNAVAILABLE' || data?.service != null;
    if (isServiceUnavailable) {
      window.dispatchEvent(
        new CustomEvent(SERVICE_DEGRADED_EVENT, {
          detail: {
            message: data.error || 'Service temporarily unavailable',
            service: data.service || 'supabase',
          },
        })
      );
    }
    throw new ApiError(data?.error || `HTTP ${response.status}`, 503, data, data?.code);
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
    return fetchJsonDeduped('/api/status');
  },

  // === Projects ===

  async getProjects(): Promise<ProjectListItem[]> {
    return fetchJsonDeduped('/api/projects');
  },

  async getProject(id: string): Promise<ProjectWithChapterList> {
    return fetchJsonDeduped(`/api/projects/${id}`);
  },

  async getChaptersSummary(projectId: string): Promise<ChapterSummary[]> {
    return fetchJsonDeduped(`/api/projects/${projectId}/chapters/summary`);
  },

  async searchProject(
    projectId: string,
    query: string,
    field: 'original' | 'translated' | 'both' = 'translated'
  ): Promise<{ matches: ProjectSearchMatch[] }> {
    const params = new URLSearchParams({ q: query, field });
    return fetchJson(`/api/projects/${projectId}/search?${params}`);
  },

  async bulkUpdateParagraphs(
    projectId: string,
    updates: Array<{ chapterId: string; paragraphId: string; translatedText: string }>
  ): Promise<{ succeeded: string[]; failed: Array<{ paragraphId: string; error: string }> }> {
    return fetchJson(`/api/projects/${projectId}/paragraphs/bulk-update`, {
      method: 'POST',
      body: JSON.stringify({ updates }),
    });
  },

  async createProject(
    name: string,
    options?: { sourceLanguage?: string; targetLanguage?: string }
  ): Promise<Project> {
    return fetchJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        sourceLanguage: options?.sourceLanguage,
        targetLanguage: options?.targetLanguage,
      }),
    });
  },

  async updateProjectLanguages(
    projectId: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ sourceLanguage: string; targetLanguage: string }> {
    return fetchJson(`/api/projects/${projectId}/languages`, {
      method: 'PUT',
      body: JSON.stringify({ sourceLanguage, targetLanguage }),
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

  /** Get current user's reader settings (auth required). Returns null if none saved. */
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

  // === Chapters ===

  async uploadChapter(
    projectId: string,
    file: File,
    title: string,
    signal?: AbortSignal,
    onProgress?: UploadProgressCallback
  ): Promise<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    // Send actual filename so server gets correct UTF-8 name (avoids multipart encoding issues with Cyrillic, etc.)
    formData.append('filename', file.name);

    if (onProgress) {
      return fetchFormDataWithProgress<
        Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }
      >(`/api/projects/${projectId}/chapters`, formData, {
        signal,
        onProgress,
      });
    }

    return fetchFormData<Chapter | { chapters: Chapter[]; count: number; warnings?: string[] }>(
      `/api/projects/${projectId}/chapters`,
      formData,
      { method: 'POST', signal }
    );
  },

  async startImportJob(
    projectId: string,
    file: File,
    title: string,
    signal?: AbortSignal,
    onProgress?: UploadProgressCallback
  ): Promise<{ jobId: string; status: 'queued' }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('filename', file.name);

    if (onProgress) {
      return fetchFormDataWithProgress<{ jobId: string; status: 'queued' }>(
        `/api/projects/${projectId}/chapters/import`,
        formData,
        { signal, onProgress }
      );
    }

    return fetchFormData<{ jobId: string; status: 'queued' }>(
      `/api/projects/${projectId}/chapters/import`,
      formData,
      { method: 'POST', signal }
    );
  },

  async getImportJob(
    projectId: string,
    jobId: string,
    signal?: AbortSignal
  ): Promise<ImportJobState> {
    return fetchJson(`/api/projects/${projectId}/import-jobs/${jobId}?compact=1`, {
      signal,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  },

  async cancelImportJob(projectId: string, jobId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/import-jobs/${jobId}/cancel`, { method: 'POST' });
  },

  async getChapter(projectId: string, chapterId: string, signal?: AbortSignal): Promise<Chapter> {
    return fetchJsonDeduped(`/api/projects/${projectId}/chapters/${chapterId}`, { signal });
  },

  /** Lightweight: only chapter status (for polling during translation). When translating, may include chunksDone/totalChunks. */
  async getChapterStatus(
    projectId: string,
    chapterId: string
  ): Promise<{ status: Chapter['status']; chunksDone?: number; totalChunks?: number }> {
    return fetchJsonDeduped(`/api/projects/${projectId}/chapters/${chapterId}/status`);
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

  async updateChapterStatus(
    projectId: string,
    chapterId: string,
    status: Chapter['status']
  ): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
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

  async markChaptersAsTranslatedBatch(
    projectId: string,
    chapterIds: string[],
    options?: { continueOnError?: boolean; signal?: AbortSignal }
  ): Promise<MarkTranslatedBatchResponse> {
    return fetchJson(`/api/projects/${projectId}/chapters/mark-as-translated-batch`, {
      method: 'POST',
      body: JSON.stringify({
        chapterIds,
        options: {
          continueOnError: options?.continueOnError ?? true,
        },
      }),
      signal: options?.signal,
    });
  },

  async getChapterStats(projectId: string, chapterId: string): Promise<ChapterStats> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/stats`);
  },

  async analyzeChaptersBatch(
    projectId: string,
    chapterIds: string[]
  ): Promise<{
    success: boolean;
    totalChapters: number;
    successful: number;
    failed: number;
    totalTokensUsed: number;
    totalDuration: number;
    glossaryEntriesAdded: number;
  }> {
    return fetchJson(`/api/projects/${projectId}/chapters/analyze-batch`, {
      method: 'POST',
      body: JSON.stringify({ chapterIds }),
    });
  },

  /** Start async batch analysis (returns jobId for polling). */
  async startAnalyzeBatch(
    projectId: string,
    chapterIds: string[],
    signal?: AbortSignal
  ): Promise<{ jobId: string; status: 'queued' }> {
    return fetchJson(`/api/projects/${projectId}/chapters/analyze-batch?async=1`, {
      method: 'POST',
      body: JSON.stringify({ chapterIds }),
      signal,
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
    });
  },

  async getAnalysisJob(
    projectId: string,
    jobId: string,
    signal?: AbortSignal
  ): Promise<AnalysisJobState> {
    return fetchJson(`/api/projects/${projectId}/analysis-jobs/${jobId}?compact=1`, {
      signal,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  },

  async cancelAnalysisJob(projectId: string, jobId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/analysis-jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  },

  /** List all chapter jobs (analysis + translate) for a project. */
  async getProjectJobs(projectId: string, signal?: AbortSignal): Promise<ProjectJobsResponse> {
    return fetchJson(`/api/projects/${projectId}/jobs`, {
      signal,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  },

  /** Start async batch translate (returns jobId for polling). */
  async startTranslateBatch(
    projectId: string,
    chapterIds: string[],
    body?: { translateOnlyEmpty?: boolean; stages?: string[] | 'all' },
    signal?: AbortSignal
  ): Promise<{ jobId: string; status: 'queued' }> {
    return fetchJson(`/api/projects/${projectId}/chapters/translate-batch?async=1`, {
      method: 'POST',
      body: JSON.stringify({
        chapterIds,
        translateOnlyEmpty: body?.translateOnlyEmpty,
        stages: body?.stages,
      }),
      signal,
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
    });
  },

  async getTranslateJob(
    projectId: string,
    jobId: string,
    signal?: AbortSignal
  ): Promise<TranslateJobState> {
    return fetchJson(`/api/projects/${projectId}/translate-jobs/${jobId}`, {
      signal,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  },

  async cancelTranslateJob(projectId: string, jobId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/translate-jobs/${jobId}/cancel`, {
      method: 'POST',
    });
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

  /** Bulk delete glossary entries (one request) */
  async deleteGlossaryEntries(
    projectId: string,
    entryIds: string[]
  ): Promise<{ success: boolean; deletedCount: number }> {
    return fetchJson(`/api/projects/${projectId}/glossary/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ entryIds }),
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
    const hasEntityFilter =
      Boolean(params?.authorEntityId) ||
      Boolean(params?.translatorEntityId) ||
      Boolean(params?.tagEntityId);
    const isDefaultCatalogRequest =
      !hasEntityFilter &&
      (params?.limit ?? 50) === 50 &&
      (params?.offset ?? 0) === 0 &&
      (params?.orderBy ?? 'published_at') === 'published_at' &&
      (params?.orderAsc ?? false) === false;
    const localKey = cacheVersionedKey([CACHE_PREFIX.publicationsList, 'catalog-default']);
    if (isDefaultCatalogRequest) {
      const local = getLocalStorageCached<PublicationListItem[]>(
        localKey,
        CACHE_TTL.clientCatalogLocalStorageMs
      );
      if (local) return local;
    }
    const data = await fetchJsonDeduped<PublicationListItem[]>(requestUrl);
    if (isDefaultCatalogRequest) {
      setLocalStorageCached(localKey, data);
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
    const url = `/api/publications/${publicationId}/download?format=${format}`;
    const token = authService.getToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        (errData as { error?: string })?.error || res.statusText || 'Download failed',
        res.status,
        errData
      );
    }
    const blob = await res.blob();
    const contentDisposition = res.headers.get('Content-Disposition');
    const match = contentDisposition?.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || `book.${format}`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    return { filename };
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
      authorEntityId?: string | null;
      translatorEntityId?: string | null;
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

  /** Get translation reports count for project (auth required, owner only). */
  async getProjectReportsCount(projectId: string): Promise<{ count: number }> {
    return fetchJson(`/api/projects/${projectId}/reports-count`);
  },

  /** Get translation reports for project (auth required, owner only). */
  async getProjectReports(projectId: string): Promise<
    Array<{
      id: string;
      publicationId: string;
      chapterId: string;
      chapterNumber?: number;
      chapterTitle?: string;
      description: string;
      reporterUserId: string | null;
      status: string;
      createdAt: string;
    }>
  > {
    return fetchJson(`/api/projects/${projectId}/reports`);
  },

  /** Update translation report status (auth required, owner only). */
  async updateReportStatus(
    projectId: string,
    reportId: string,
    status: 'pending' | 'reviewed' | 'resolved'
  ): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  /** Delete translation report (auth required, owner only). */
  async deleteReport(projectId: string, reportId: string): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/reports/${reportId}`, {
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

  // === Public entities (admin metadata) ===

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

  async createPublicEntity(data: {
    kind: PublicEntityKind;
    name: string;
    description?: string;
    photoUrl?: string;
  }): Promise<PublicEntity> {
    return fetchJson<PublicEntity>('/api/admin/entities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createPublicEntityWithPhoto(data: {
    kind: PublicEntityKind;
    name: string;
    description?: string;
    photo?: File;
  }): Promise<PublicEntity> {
    const formData = new FormData();
    formData.append('kind', data.kind);
    formData.append('name', data.name);
    if (data.description) formData.append('description', data.description);
    if (data.photo) formData.append('photo', data.photo);
    return fetchFormData<PublicEntity>('/api/admin/entities', formData, { method: 'POST' });
  },

  async updatePublicEntity(
    id: string,
    data: { name?: string; description?: string | null; photoUrl?: string | null }
  ): Promise<PublicEntity> {
    const result = await fetchJson<PublicEntity>(`/api/admin/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    publicationCache.publicEntity.delete(id);
    return result;
  },

  async updatePublicEntityWithPhoto(
    id: string,
    data: { name?: string; description?: string; photo?: File; removePhoto?: boolean }
  ): Promise<PublicEntity> {
    const formData = new FormData();
    if (data.name !== undefined) formData.append('name', data.name);
    if (data.description !== undefined) formData.append('description', data.description);
    if (data.photo) formData.append('photo', data.photo);
    if (data.removePhoto) formData.append('removePhoto', 'true');
    const result = await fetchFormData<PublicEntity>(`/api/admin/entities/${id}`, formData, {
      method: 'PATCH',
    });
    publicationCache.publicEntity.delete(id);
    return result;
  },

  async deletePublicEntity(id: string): Promise<void> {
    await fetchJson(`/api/admin/entities/${id}`, { method: 'DELETE' });
    publicationCache.publicEntity.delete(id);
  },

  async getEntityUsage(id: string): Promise<{ usageCount: number }> {
    return fetchJson<{ usageCount: number }>(`/api/admin/entities/${id}/usage`);
  },

  // === Token Usage ===

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
      lastReadChapterId: string | null;
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
        lastReadChapterId: string | null;
        lastReadAt: string | null;
      }>;
    }>('/api/user/reading-history');
    setCached(userScopedCache.readingHistory, userId, data);
    return data;
  },
};

export default api;
