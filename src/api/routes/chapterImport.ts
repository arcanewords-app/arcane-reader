import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import type { RouteDeps } from './deps.js';
import {
  createHandleStartImportJob,
  createHandleGetImportJobStatus,
  createHandleCancelImportJob,
  handleSyncChapterImport,
} from './handlers/chapterImportRouteHandlers.js';

export function registerChapterImportRoutes(app: Application, deps: RouteDeps): void {
  app.post(
    '/api/projects/:id/chapters/import',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.upload.single('file')),
    createHandleStartImportJob(deps)
  );

  app.get(
    '/api/projects/:id/import-jobs/:jobId',
    requireAuth,
    requireRole('author'),
    createHandleGetImportJobStatus(deps)
  );

  app.post(
    '/api/projects/:id/import-jobs/:jobId/cancel',
    requireAuth,
    requireRole('author'),
    createHandleCancelImportJob(deps)
  );

  app.post(
    '/api/projects/:id/chapters',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.upload.single('file')),
    handleSyncChapterImport
  );
}
