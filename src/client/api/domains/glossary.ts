import type { GlossaryEntry, GlossaryImportResult } from '../../types.js';
import { authService } from '../../services/authService.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchFormData } from '../transport/fetchFormData.js';
import { downloadBlob } from '../transport/downloadBlob.js';

export const glossaryApi = {
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

  /** Download glossary as JSON or CSV */
  async exportGlossary(projectId: string, format: 'json' | 'csv'): Promise<{ filename: string }> {
    return downloadBlob(`/api/projects/${projectId}/glossary/export?format=${format}`, {
      token: authService.getToken(),
      fallbackFilename: `glossary-${projectId}.${format}`,
      failureMessage: 'Export failed',
    });
  },

  /** Import glossary from JSON or CSV file (append, skip duplicates) */
  async importGlossary(projectId: string, file: File): Promise<GlossaryImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return fetchFormData<GlossaryImportResult>(
      `/api/projects/${projectId}/glossary/import`,
      formData
    );
  },
};
