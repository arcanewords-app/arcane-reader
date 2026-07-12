import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import type { RouteDeps } from './deps.js';
import {
  handleCreatePublicEntity,
  handleUpdatePublicEntity,
  handleDeletePublicEntity,
  handleGetPublicEntityUsage,
  handleListAdminNews,
  handleCreateNewsPost,
  handleGetAdminNewsPost,
  handleUpdateNewsPost,
  handleDeleteNewsPost,
  handlePublishNewsPost,
  handleTranslateNewsPost,
  handleListAnnouncementAlerts,
  handleCreateAnnouncementAlert,
  handleCreateAnnouncementFromNews,
  handleUpdateAnnouncementAlert,
  handleDeleteAnnouncementAlert,
  handleListAdminPublications,
  handleUnpublishPublicationAdmin,
  handleListAdminProjects,
  handleUnpublishProjectAdmin,
  handleDeleteProjectAdmin,
  handleListAdminUsers,
  handleUpdateUserRoleAdmin,
  handleListAdminTranslationRequests,
  handleUpdateAdminTranslationRequest,
  handleDeleteAdminTranslationRequest,
} from './handlers/adminRouteHandlers.js';

export function registerAdminRoutes(app: Application, deps: RouteDeps): void {
  app.post(
    '/api/admin/entities',
    requireAuth,
    requireRole('admin'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    handleCreatePublicEntity
  );
  app.patch(
    '/api/admin/entities/:id',
    requireAuth,
    requireRole('admin'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    handleUpdatePublicEntity
  );
  app.delete(
    '/api/admin/entities/:id',
    requireAuth,
    requireRole('admin'),
    handleDeletePublicEntity
  );
  app.get(
    '/api/admin/entities/:id/usage',
    requireAuth,
    requireRole('admin'),
    handleGetPublicEntityUsage
  );
  app.get('/api/admin/news', requireAuth, requireRole('admin'), handleListAdminNews);
  app.post('/api/admin/news', requireAuth, requireRole('admin'), handleCreateNewsPost);
  app.get('/api/admin/news/:id', requireAuth, requireRole('admin'), handleGetAdminNewsPost);
  app.patch('/api/admin/news/:id', requireAuth, requireRole('admin'), handleUpdateNewsPost);
  app.delete('/api/admin/news/:id', requireAuth, requireRole('admin'), handleDeleteNewsPost);
  app.post('/api/admin/news/:id/publish', requireAuth, requireRole('admin'), handlePublishNewsPost);
  app.post(
    '/api/admin/news/:id/translate',
    requireAuth,
    requireRole('admin'),
    handleTranslateNewsPost
  );
  app.get(
    '/api/admin/announcements',
    requireAuth,
    requireRole('admin'),
    handleListAnnouncementAlerts
  );
  app.post(
    '/api/admin/announcements',
    requireAuth,
    requireRole('admin'),
    handleCreateAnnouncementAlert
  );
  app.post(
    '/api/admin/announcements/from-news/:newsId',
    requireAuth,
    requireRole('admin'),
    handleCreateAnnouncementFromNews
  );
  app.patch(
    '/api/admin/announcements/:id',
    requireAuth,
    requireRole('admin'),
    handleUpdateAnnouncementAlert
  );
  app.delete(
    '/api/admin/announcements/:id',
    requireAuth,
    requireRole('admin'),
    handleDeleteAnnouncementAlert
  );
  app.get(
    '/api/admin/publications',
    requireAuth,
    requireRole('admin'),
    handleListAdminPublications
  );
  app.post(
    '/api/admin/publications/:id/unpublish',
    requireAuth,
    requireRole('admin'),
    handleUnpublishPublicationAdmin
  );
  app.get('/api/admin/projects', requireAuth, requireRole('admin'), handleListAdminProjects);
  app.post(
    '/api/admin/projects/:id/unpublish',
    requireAuth,
    requireRole('admin'),
    handleUnpublishProjectAdmin
  );
  app.delete(
    '/api/admin/projects/:id',
    requireAuth,
    requireRole('admin'),
    handleDeleteProjectAdmin
  );
  app.get('/api/admin/users', requireAuth, requireRole('admin'), handleListAdminUsers);
  app.patch(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole('admin'),
    handleUpdateUserRoleAdmin
  );
  app.get(
    '/api/admin/translation-requests',
    requireAuth,
    requireRole('admin'),
    handleListAdminTranslationRequests
  );
  app.patch(
    '/api/admin/translation-requests/:id',
    requireAuth,
    requireRole('admin'),
    handleUpdateAdminTranslationRequest
  );
  app.delete(
    '/api/admin/translation-requests/:id',
    requireAuth,
    requireRole('admin'),
    handleDeleteAdminTranslationRequest
  );
}
