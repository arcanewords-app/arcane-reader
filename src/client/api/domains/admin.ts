import type {
  PublicEntity,
  PublicEntityKind,
  NewsPost,
  NewsCategory,
  NewsStatus,
  AnnouncementAlert,
  AnnouncementVariant,
  AnnouncementMinRole,
  AdminPublicationListItem,
  PublicationStatus,
  AdminProjectCard,
  AdminProjectListItem,
  AdminProjectPublicationFilter,
  AdminUserListItem,
  UserRole,
  AdminCatalogTranslationRequest,
  CatalogTranslationRequestStatus,
} from '../../types.js';
import { publicationCache } from '../cache/memoryCache.js';
import { fetchJson } from '../transport/fetchJson.js';
import { fetchFormData } from '../transport/fetchFormData.js';

export const adminApi = {
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

  async getAdminNewsPosts(params?: {
    status?: NewsStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<NewsPost[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<NewsPost[]>(`/api/admin/news${qs ? `?${qs}` : ''}`);
  },

  async createNewsPost(data: {
    title: string;
    summary: string;
    body?: string;
    category?: NewsCategory;
    slug?: string | null;
  }): Promise<NewsPost> {
    return fetchJson<NewsPost>('/api/admin/news', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateNewsPost(
    id: string,
    data: Partial<{
      title: string;
      summary: string;
      body: string;
      category: NewsCategory;
      status: NewsStatus;
      slug: string | null;
      translation: {
        locale: 'en' | 'be' | 'pl';
        title: string;
        summary: string;
        body: string;
        status: 'draft' | 'ready';
      };
    }>
  ): Promise<NewsPost> {
    return fetchJson<NewsPost>(`/api/admin/news/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async publishNewsPost(id: string): Promise<NewsPost> {
    return fetchJson<NewsPost>(`/api/admin/news/${id}/publish`, { method: 'POST' });
  },

  async deleteNewsPost(id: string): Promise<void> {
    await fetchJson(`/api/admin/news/${id}`, { method: 'DELETE' });
  },

  async translateNewsPost(id: string, data: { locale: 'en' | 'be' | 'pl' }): Promise<NewsPost> {
    return fetchJson<NewsPost>(`/api/admin/news/${id}/translate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdminAnnouncements(): Promise<AnnouncementAlert[]> {
    return fetchJson<AnnouncementAlert[]>('/api/admin/announcements');
  },

  async createAnnouncement(data: {
    newsPostId?: string | null;
    message?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    variant?: AnnouncementVariant;
    minRole?: AnnouncementMinRole;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive?: boolean;
    priority?: number;
    dismissible?: boolean;
  }): Promise<AnnouncementAlert> {
    return fetchJson<AnnouncementAlert>('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createAnnouncementFromNews(
    newsId: string,
    data: {
      message?: string | null;
      ctaLabel?: string | null;
      ctaUrl?: string | null;
      variant?: AnnouncementVariant;
      minRole?: AnnouncementMinRole;
      startsAt?: string | null;
      endsAt?: string | null;
      isActive?: boolean;
      priority?: number;
      dismissible?: boolean;
    }
  ): Promise<AnnouncementAlert> {
    return fetchJson<AnnouncementAlert>(`/api/admin/announcements/from-news/${newsId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAnnouncement(
    id: string,
    data: Partial<{
      message: string | null;
      ctaLabel: string | null;
      ctaUrl: string | null;
      variant: AnnouncementVariant;
      minRole: AnnouncementMinRole;
      startsAt: string | null;
      endsAt: string | null;
      isActive: boolean;
      priority: number;
      contentVersion: number;
      dismissible: boolean;
      translation: { locale: 'en' | 'be' | 'pl'; message: string; ctaLabel: string };
    }>
  ): Promise<AnnouncementAlert> {
    return fetchJson<AnnouncementAlert>(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await fetchJson(`/api/admin/announcements/${id}`, { method: 'DELETE' });
  },

  async getAdminPublications(params?: {
    status?: PublicationStatus;
    search?: string;
    targetLanguage?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminPublicationListItem[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.targetLanguage) query.set('targetLanguage', params.targetLanguage);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<AdminPublicationListItem[]>(`/api/admin/publications${qs ? `?${qs}` : ''}`);
  },

  async adminUnpublishPublication(id: string): Promise<{ ok: boolean }> {
    return fetchJson<{ ok: boolean }>(`/api/admin/publications/${id}/unpublish`, {
      method: 'POST',
    });
  },

  async getAdminProjectCard(id: string): Promise<AdminProjectCard> {
    return fetchJson<AdminProjectCard>(`/api/admin/projects/${id}`);
  },

  async updateAdminProjectCard(
    id: string,
    data: {
      name?: string;
      originalTitle?: string | null;
      catalogTitle?: string | null;
      description?: string | null;
      sourceUrl?: string | null;
      authorEntityId?: string | null;
      translatorEntityId?: string | null;
      tagEntityIds?: string[];
      translationStatus?: AdminProjectCard['translationStatus'];
    }
  ): Promise<AdminProjectCard> {
    return fetchJson<AdminProjectCard>(`/api/admin/projects/${id}/card`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async uploadAdminProjectCover(id: string, image: File): Promise<AdminProjectCard> {
    const formData = new FormData();
    formData.append('image', image);
    return fetchFormData<AdminProjectCard>(`/api/admin/projects/${id}/cover`, formData, {
      method: 'POST',
    });
  },

  async deleteAdminProjectCover(id: string): Promise<AdminProjectCard> {
    return fetchJson<AdminProjectCard>(`/api/admin/projects/${id}/cover`, { method: 'DELETE' });
  },

  async getAdminProjects(params?: {
    search?: string;
    publicationStatus?: AdminProjectPublicationFilter;
    targetLanguage?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminProjectListItem[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.publicationStatus) query.set('publicationStatus', params.publicationStatus);
    if (params?.targetLanguage) query.set('targetLanguage', params.targetLanguage);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<AdminProjectListItem[]>(`/api/admin/projects${qs ? `?${qs}` : ''}`);
  },

  async adminUnpublishProject(id: string): Promise<{ ok: boolean }> {
    return fetchJson<{ ok: boolean }>(`/api/admin/projects/${id}/unpublish`, {
      method: 'POST',
    });
  },

  async adminDeleteProject(id: string): Promise<{ ok: boolean }> {
    return fetchJson<{ ok: boolean }>(`/api/admin/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async getAdminUsers(params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminUserListItem[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<AdminUserListItem[]>(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },

  async updateAdminUserRole(id: string, role: UserRole): Promise<AdminUserListItem> {
    return fetchJson<AdminUserListItem>(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async getAdminTranslationRequests(params?: {
    status?: CatalogTranslationRequestStatus;
    search?: string;
    targetLanguage?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminCatalogTranslationRequest[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.targetLanguage) query.set('targetLanguage', params.targetLanguage);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<AdminCatalogTranslationRequest[]>(
      `/api/admin/translation-requests${qs ? `?${qs}` : ''}`
    );
  },

  async updateAdminTranslationRequest(
    id: string,
    data: {
      status?: CatalogTranslationRequestStatus;
      adminNotes?: string | null;
      linkedPublicationId?: string | null;
    }
  ): Promise<AdminCatalogTranslationRequest> {
    return fetchJson<AdminCatalogTranslationRequest>(`/api/admin/translation-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteAdminTranslationRequest(id: string): Promise<void> {
    await fetchJson(`/api/admin/translation-requests/${id}`, { method: 'DELETE' });
  },
};
