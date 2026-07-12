import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import type { RouteDeps } from './deps.js';
import {
  handleGetGlossary,
  handleExportGlossary,
  handleImportGlossary,
  handleCreateGlossaryEntry,
  handleUpdateGlossaryEntry,
  handleDeleteGlossaryEntry,
  handleBulkDeleteGlossaryEntries,
  createHandleSuggestGlossaryMerges,
  handleMergeGlossaryEntries,
  handleUploadGlossaryEntryImage,
  handleDeleteGlossaryEntryImageByIndex,
  handleDeleteGlossaryEntryImages,
} from './handlers/glossaryRouteHandlers.js';

export function registerGlossaryRoutes(app: Application, deps: RouteDeps): void {
  app.get('/api/projects/:id/glossary', requireAuth, requireRole('author'), handleGetGlossary);
  app.get(
    '/api/projects/:id/glossary/export',
    requireAuth,
    requireRole('author'),
    handleExportGlossary
  );
  app.post(
    '/api/projects/:id/glossary/import',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadGlossaryFile.single('file')),
    handleImportGlossary
  );
  app.post(
    '/api/projects/:id/glossary',
    requireAuth,
    requireRole('author'),
    handleCreateGlossaryEntry
  );
  app.put(
    '/api/projects/:projectId/glossary/:entryId',
    requireAuth,
    requireRole('author'),
    handleUpdateGlossaryEntry
  );
  app.delete(
    '/api/projects/:projectId/glossary/:entryId',
    requireAuth,
    requireRole('author'),
    handleDeleteGlossaryEntry
  );
  app.post(
    '/api/projects/:projectId/glossary/bulk-delete',
    requireAuth,
    requireRole('author'),
    handleBulkDeleteGlossaryEntries
  );
  app.post(
    '/api/projects/:projectId/glossary/suggest-merges',
    requireAuth,
    requireRole('author'),
    createHandleSuggestGlossaryMerges(deps)
  );
  app.post(
    '/api/projects/:projectId/glossary/merge',
    requireAuth,
    requireRole('author'),
    handleMergeGlossaryEntries
  );
  app.post(
    '/api/projects/:projectId/glossary/:entryId/image',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('image')),
    handleUploadGlossaryEntryImage
  );
  app.delete(
    '/api/projects/:projectId/glossary/:entryId/image/:imageIndex',
    requireAuth,
    requireRole('author'),
    handleDeleteGlossaryEntryImageByIndex
  );
  app.delete(
    '/api/projects/:projectId/glossary/:entryId/image',
    requireAuth,
    requireRole('author'),
    handleDeleteGlossaryEntryImages
  );
}
