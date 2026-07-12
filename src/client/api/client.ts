/**
 * Arcane Reader - API Client
 * Typed fetch wrapper for REST API communication
 */

export { ApiError } from './errors.js';
export { clearCatalogLocalCache } from './cache/localStorageCache.js';
export type { UploadProgressCallback } from './transport/fetchFormDataWithProgress.js';

import './cache/invalidation.js';

import { adminApi } from './domains/admin.js';
import { catalogApi } from './domains/catalog.js';
import { chaptersApi } from './domains/chapters.js';
import { entitiesApi } from './domains/entities.js';
import { glossaryApi } from './domains/glossary.js';
import { newsApi } from './domains/news.js';
import { projectsApi } from './domains/projects.js';
import { publicationsApi } from './domains/publications.js';
import { userApi } from './domains/user.js';

export const api = {
  ...projectsApi,
  ...userApi,
  ...chaptersApi,
  ...glossaryApi,
  ...publicationsApi,
  ...entitiesApi,
  ...newsApi,
  ...adminApi,
  ...catalogApi,
};

export default api;
