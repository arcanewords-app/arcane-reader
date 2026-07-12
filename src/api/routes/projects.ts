import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import type { RouteDeps } from './deps.js';
import {
  handleBulkUpdateParagraphs,
  handleCloneProject,
  handleCreateProject,
  handleDeleteProject,
  handleGetChaptersSummary,
  handleGetProject,
  handleGetReaderSettings,
  handleListProjects,
  handleProjectAiReplace,
  handleRenameProject,
  handleSearchProject,
  handleTransferChapters,
  handleUpdateProjectLanguages,
  handleUpdateProjectSettings,
  handleUpdateReaderSettings,
} from './handlers/projectRouteHandlers.js';

export function registerProjectRoutes(app: Application, _deps: RouteDeps): void {
  app.get('/api/projects', requireAuth, requireRole('author'), handleListProjects);
  app.post('/api/projects', requireAuth, requireRole('author'), handleCreateProject);
  app.post('/api/projects/:id/clone', requireAuth, requireRole('author'), handleCloneProject);
  app.post(
    '/api/projects/:targetProjectId/transfer-from',
    requireAuth,
    requireRole('author'),
    handleTransferChapters
  );
  app.get('/api/projects/:id', requireAuth, requireRole('author'), handleGetProject);
  app.get(
    '/api/projects/:id/chapters/summary',
    requireAuth,
    requireRole('author'),
    handleGetChaptersSummary
  );
  app.get('/api/projects/:id/search', requireAuth, requireRole('author'), handleSearchProject);
  app.post(
    '/api/projects/:id/search/ai-replace',
    requireAuth,
    requireRole('author_plus'),
    handleProjectAiReplace
  );
  app.post(
    '/api/projects/:id/paragraphs/bulk-update',
    requireAuth,
    requireRole('author'),
    handleBulkUpdateParagraphs
  );
  app.patch('/api/projects/:id', requireAuth, requireRole('author'), handleRenameProject);
  app.delete('/api/projects/:id', requireAuth, requireRole('author'), handleDeleteProject);
  app.put(
    '/api/projects/:id/settings',
    requireAuth,
    requireRole('author'),
    handleUpdateProjectSettings
  );
  app.put(
    '/api/projects/:id/languages',
    requireAuth,
    requireRole('author'),
    handleUpdateProjectLanguages
  );
  app.get(
    '/api/projects/:id/settings/reader',
    requireAuth,
    requireRole('author'),
    handleGetReaderSettings
  );
  app.put(
    '/api/projects/:id/settings/reader',
    requireAuth,
    requireRole('author'),
    handleUpdateReaderSettings
  );
}
