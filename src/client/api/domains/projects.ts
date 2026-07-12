import type {
  SystemStatus,
  Project,
  ProjectWithChapterList,
  ProjectListItem,
  ProjectMetadata,
  ProjectSettings,
  ReaderSettings,
  ChapterSummary,
  ProjectSearchMatch,
  Publication,
  TranslationStatus,
} from '../../types.js';
import { clearCatalogLocalCache } from '../cache/localStorageCache.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchJsonDeduped } from '../transport/fetchDeduped.js';
import { fetchFormData } from '../transport/fetchFormData.js';

export const projectsApi = {
  async getStatus(): Promise<SystemStatus> {
    return fetchJsonDeduped('/api/status');
  },

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
    options: {
      field?: 'original' | 'translated' | 'both';
      caseSensitive?: boolean;
      wholeWord?: boolean;
      chapterFrom?: number;
      chapterTo?: number;
      chapterIds?: string;
      offset?: number;
      limit?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<{
    matches: ProjectSearchMatch[];
    total: number;
    hasMore: boolean;
    nextOffset?: number;
  }> {
    const params = new URLSearchParams({ q: query });
    const field = options.field ?? 'translated';
    params.set('field', field);
    if (options.caseSensitive) params.set('caseSensitive', 'true');
    if (options.wholeWord) params.set('wholeWord', 'true');
    if (options.chapterFrom != null) params.set('chapterFrom', String(options.chapterFrom));
    if (options.chapterTo != null) params.set('chapterTo', String(options.chapterTo));
    if (options.chapterIds) params.set('chapterIds', options.chapterIds);
    if (options.offset != null) params.set('offset', String(options.offset));
    if (options.limit != null) params.set('limit', String(options.limit));
    return fetchJson(`/api/projects/${projectId}/search?${params}`, {
      signal: options.signal,
    });
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

  async aiReplaceInProject(
    projectId: string,
    body: {
      find: string;
      replaceHint?: string;
      preset: 'name_declension' | 'term_unify' | 'minimal_fix';
      detail?: string;
      paragraphs: Array<{ chapterId: string; paragraphId: string }>;
    }
  ): Promise<{
    items: Array<{
      chapterId: string;
      paragraphId: string;
      paragraphIndex: number;
      chapterNumber: number;
      before: string;
      after: string;
    }>;
    tokensUsed: number;
    model: string;
    batches: number;
  }> {
    return fetchJson(`/api/projects/${projectId}/search/ai-replace`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async createProject(
    name: string,
    options?: {
      sourceLanguage?: string;
      targetLanguage?: string;
      catalogTranslationRequestId?: string;
      translatorEntityId?: string;
    }
  ): Promise<Project> {
    return fetchJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        sourceLanguage: options?.sourceLanguage,
        targetLanguage: options?.targetLanguage,
        catalogTranslationRequestId: options?.catalogTranslationRequestId,
        translatorEntityId: options?.translatorEntityId,
      }),
    });
  },

  async cloneProject(projectId: string, options?: { name?: string }): Promise<Project> {
    return fetchJson(`/api/projects/${projectId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ name: options?.name }),
    });
  },

  async renameProject(projectId: string, name: string): Promise<Project> {
    return fetchJson(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
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
    settings: Partial<ProjectSettings> | Record<string, unknown>
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
      tagEntityIds?: string[];
      translationStatus?: TranslationStatus | null;
      sourceUrl?: string | null;
    }
  ): Promise<Publication> {
    const result = await fetchJson<Publication>(`/api/projects/${projectId}/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    clearCatalogLocalCache();
    return result;
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

  /** Get publication for a project (owner, auth required). Returns null when project has no publication yet. */
  async getProjectPublication(projectId: string): Promise<Publication | null> {
    const result = await fetchJson<Publication | null>(`/api/projects/${projectId}/publication`);
    return result ?? null;
  },
};
