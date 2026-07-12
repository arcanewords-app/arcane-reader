import type { Application } from 'express';
import { requireAuth, optionalAuth, requireRole } from '../../middleware/auth.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import type { RouteDeps } from './deps.js';
import {
  handleUploadCover,
  handleDeleteCover,
  handleUpdateProjectMetadata,
  handleExportProject,
  handleExportDownload,
  handleBuildPublicationExports,
  handleUpdatePublicationDisplaySettings,
  handlePublicationDownload,
  handleListPublicEntities,
  handleGetPublicEntity,
  handleListNews,
  handleGetNewsPost,
  handleGetActiveAnnouncement,
  handleDismissAnnouncement,
  handleListPublications,
  handleGetPublication,
  handleGetPublicationChapters,
  handleGetPublicationChapter,
  handleGetPublicationGlossary,
  handleGetReadProgress,
  handleReportPublication,
  handleMarkChapterRead,
  handleUpdateReadingPosition,
  handlePublishProject,
  handleUnpublishProject,
  handleGetUserPublications,
  handleGetProjectPublication,
} from './handlers/publicationRouteHandlers.js';

export function registerPublicationRoutes(app: Application, deps: RouteDeps): void {
  app.post(
    '/api/projects/:projectId/cover',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('image')),
    handleUploadCover
  );

  app.delete(
    '/api/projects/:projectId/cover',
    requireAuth,
    requireRole('author'),
    handleDeleteCover
  );

  app.put(
    '/api/projects/:projectId/metadata',
    requireAuth,
    requireRole('author'),
    handleUpdateProjectMetadata
  );

  app.post('/api/projects/:id/export', requireAuth, requireRole('author'), handleExportProject);

  app.get(
    '/api/projects/:id/export/download',
    requireAuth,
    requireRole('author'),
    handleExportDownload
  );

  app.post(
    '/api/publications/:id/build-exports',
    requireAuth,
    requireRole('author'),
    handleBuildPublicationExports
  );

  app.patch(
    '/api/publications/:id',
    requireAuth,
    requireRole('author'),
    handleUpdatePublicationDisplaySettings
  );

  app.get('/api/publications/:id/download', requireAuth, handlePublicationDownload);

  app.get('/api/public/entities', handleListPublicEntities);

  app.get('/api/public/entities/:id', handleGetPublicEntity);

  app.get('/api/news', handleListNews);

  app.get('/api/news/:idOrSlug', handleGetNewsPost);

  app.get('/api/announcements/active', optionalAuth, handleGetActiveAnnouncement);

  app.post('/api/announcements/:id/dismiss', requireAuth, handleDismissAnnouncement);

  app.get('/api/publications', handleListPublications);

  app.get('/api/publications/:id', handleGetPublication);

  app.get('/api/publications/:id/chapters', handleGetPublicationChapters);

  app.get('/api/publications/:id/chapters/:chapterId', handleGetPublicationChapter);

  app.get('/api/publications/:id/glossary', handleGetPublicationGlossary);

  app.get('/api/publications/:id/read-progress', optionalAuth, handleGetReadProgress);

  app.post('/api/publications/:id/report', requireAuth, handleReportPublication);

  app.post('/api/publications/:id/chapters/:chapterId/read', requireAuth, handleMarkChapterRead);

  app.patch('/api/publications/:id/reading-position', requireAuth, handleUpdateReadingPosition);

  app.post(
    '/api/projects/:projectId/publish',
    requireAuth,
    requireRole('author'),
    handlePublishProject
  );

  app.delete(
    '/api/projects/:projectId/publish',
    requireAuth,
    requireRole('author'),
    handleUnpublishProject
  );

  app.get('/api/user/publications', requireAuth, requireRole('author'), handleGetUserPublications);

  app.get(
    '/api/projects/:projectId/publication',
    requireAuth,
    requireRole('author'),
    handleGetProjectPublication
  );
}
