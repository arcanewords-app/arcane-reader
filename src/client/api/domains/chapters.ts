import type {
  Chapter,
  ChapterStats,
  ImportJobState,
  AnalysisJobState,
  TranslateJobState,
  ProjectJobsResponse,
  MarkTranslatedBatchResponse,
  TransferChaptersResult,
  TranslateResponse,
  ChapterTranslationOptions,
  LanguagePairOptions,
  Paragraph,
  Project,
} from '../../types.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';
import { fetchFormData } from '../transport/fetchFormData.js';
import {
  fetchFormDataWithProgress,
  type UploadProgressCallback,
} from '../transport/fetchFormDataWithProgress.js';

export const chaptersApi = {
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

  /** Bypass in-flight GET dedupe — use after translation completes. */
  async getChapterFresh(projectId: string, chapterId: string): Promise<Chapter> {
    const url = `/api/projects/${projectId}/chapters/${chapterId}?_=${Date.now()}`;
    return fetchJson<Chapter>(url);
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

  async transferChaptersFromProject(
    targetProjectId: string,
    body: {
      sourceProjectId: string;
      chapterIds: string[];
      includeGlossary?: boolean;
    }
  ): Promise<TransferChaptersResult> {
    return fetchJson(`/api/projects/${targetProjectId}/transfer-from`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async duplicateChapters(
    projectId: string,
    chapterIds: string[]
  ): Promise<TransferChaptersResult> {
    return fetchJson(`/api/projects/${projectId}/chapters/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ chapterIds }),
    });
  },

  async bulkDeleteChapters(projectId: string, chapterIds: string[]): Promise<{ deleted: number }> {
    return fetchJson(`/api/projects/${projectId}/chapters/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ chapterIds }),
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
    options?: {
      continueOnError?: boolean;
      skipCacheInvalidation?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<MarkTranslatedBatchResponse> {
    return fetchJson(`/api/projects/${projectId}/chapters/mark-as-translated-batch`, {
      method: 'POST',
      body: JSON.stringify({
        chapterIds,
        options: {
          continueOnError: options?.continueOnError ?? true,
          ...(options?.skipCacheInvalidation !== undefined
            ? { skipCacheInvalidation: options.skipCacheInvalidation }
            : {}),
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
    options?: { languagePair?: LanguagePairOptions; signal?: AbortSignal }
  ): Promise<{ jobId: string; status: 'queued' }> {
    const signal = options?.signal;
    return fetchJson(`/api/projects/${projectId}/chapters/analyze-batch?async=1`, {
      method: 'POST',
      body: JSON.stringify({
        chapterIds,
        ...(options?.languagePair ? { languagePair: options.languagePair } : {}),
      }),
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
    body?: {
      translateOnlyEmpty?: boolean;
      translateChapterTitles?: boolean;
      stages?: string[] | 'all';
      languagePair?: LanguagePairOptions;
    },
    signal?: AbortSignal
  ): Promise<{ jobId: string; status: 'queued' }> {
    return fetchJson(`/api/projects/${projectId}/chapters/translate-batch?async=1`, {
      method: 'POST',
      body: JSON.stringify({
        chapterIds,
        translateOnlyEmpty: body?.translateOnlyEmpty,
        translateChapterTitles: body?.translateChapterTitles,
        stages: body?.stages,
        ...(body?.languagePair ? { languagePair: body.languagePair } : {}),
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
    if (options?.translateChapterTitles !== undefined) {
      body.translateChapterTitles = options.translateChapterTitles;
    }
    if (options?.paragraphIds?.length) {
      body.paragraphIds = options.paragraphIds;
    }
    if (options?.stages !== undefined) {
      body.stages = options.stages;
    }
    if (options?.languagePair) {
      body.languagePair = options.languagePair;
    }
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/translate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async runChapterCritic(
    projectId: string,
    chapterId: string,
    options?: { force?: boolean }
  ): Promise<{ report: import('../../types').ChapterCriticReport; cached: boolean }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/critic`, {
      method: 'POST',
      body: JSON.stringify({ force: options?.force ?? false }),
    });
  },

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
};
