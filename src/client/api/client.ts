/**
 * Arcane Reader - API Client
 * Typed fetch wrapper for REST API communication
 */

import type {
  SystemStatus,
  Project,
  ProjectListItem,
  ProjectSettings,
  ReaderSettings,
  Chapter,
  ChapterStats,
  GlossaryEntry,
  Paragraph,
  TranslateResponse,
  BulkUpdateResponse,
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

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error || `HTTP ${response.status}`,
      response.status,
      data
    );
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
    title: string
  ): Promise<Chapter> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    const response = await fetch(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Upload failed', response.status, data);
    }

    return response.json();
  },

  async getChapter(projectId: string, chapterId: string): Promise<Chapter> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}`);
  },

  async deleteChapter(
    projectId: string,
    chapterId: string
  ): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },

  async updateChapterTitle(
    projectId: string,
    chapterId: string,
    title: string
  ): Promise<Chapter> {
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

  async cancelTranslation(
    projectId: string,
    chapterId: string
  ): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/translate/cancel`, {
      method: 'POST',
    });
  },

  async getChapterStats(
    projectId: string,
    chapterId: string
  ): Promise<ChapterStats> {
    return fetchJson(`/api/projects/${projectId}/chapters/${chapterId}/stats`);
  },

  async translateChapter(
    projectId: string,
    chapterId: string,
    translateOnlyEmpty: boolean = false
  ): Promise<TranslateResponse> {
    return fetchJson(
      `/api/projects/${projectId}/chapters/${chapterId}/translate`,
      {
        method: 'POST',
        body: JSON.stringify({ translateOnlyEmpty }),
      }
    );
  },

  // === Paragraphs ===

  async updateParagraph(
    projectId: string,
    chapterId: string,
    paragraphId: string,
    updates: Partial<Pick<Paragraph, 'translatedText' | 'status'>>
  ): Promise<Paragraph> {
    return fetchJson(
      `/api/projects/${projectId}/chapters/${chapterId}/paragraphs/${paragraphId}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
  },

  async bulkUpdateParagraphs(
    projectId: string,
    chapterId: string,
    paragraphIds: string[],
    status: string
  ): Promise<BulkUpdateResponse> {
    return fetchJson(
      `/api/projects/${projectId}/chapters/${chapterId}/paragraphs/bulk-status`,
      {
        method: 'POST',
        body: JSON.stringify({ paragraphIds, status }),
      }
    );
  },

  // === Glossary ===

  async getGlossary(projectId: string): Promise<GlossaryEntry[]> {
    return fetchJson(`/api/projects/${projectId}/glossary`);
  },

  async addGlossary(
    projectId: string,
    entry: Omit<GlossaryEntry, 'id'>
  ): Promise<GlossaryEntry> {
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

  async deleteGlossaryEntry(
    projectId: string,
    entryId: string
  ): Promise<{ success: boolean }> {
    return fetchJson(`/api/projects/${projectId}/glossary/${entryId}`, {
      method: 'DELETE',
    });
  },

  async uploadGlossaryImage(
    projectId: string,
    entryId: string,
    file: File
  ): Promise<{ imageUrl: string; imageUrls: string[]; entry: GlossaryEntry }> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(
      `/api/projects/${projectId}/glossary/${entryId}/image`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Upload failed', response.status, data);
    }

    return response.json();
  },

  async deleteGlossaryImage(
    projectId: string,
    entryId: string,
    imageIndex?: number
  ): Promise<{ success: boolean; imageUrls?: string[] }> {
    const url = imageIndex !== undefined
      ? `/api/projects/${projectId}/glossary/${entryId}/image/${imageIndex}`
      : `/api/projects/${projectId}/glossary/${entryId}/image`;
    
    return fetchJson(url, {
      method: 'DELETE',
    });
  },

  // === Export ===

  async exportProject(
    projectId: string,
    format: 'epub' | 'fb2',
    author?: string
  ): Promise<{ success: boolean; format: string; filename: string; url: string; path: string }> {
    return fetchJson(`/api/projects/${projectId}/export`, {
      method: 'POST',
      body: JSON.stringify({ format, author }),
    });
  },
};

export default api;

