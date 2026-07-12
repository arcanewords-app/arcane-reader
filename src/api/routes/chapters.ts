import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import type { RouteDeps } from './deps.js';
import {
  handleGetChapterStatus,
  handleGetChapter,
  handleDeleteChapter,
  handleDuplicateChapters,
  handleBulkDeleteChapters,
  handleCancelTranslation,
  handleSyncTranslation,
  handleUploadTranslation,
  handleMarkAsTranslated,
  handleMarkAsTranslatedBatch,
  handleChapterCritic,
  handleGetChapterStats,
  handleUpdateChapterTitle,
  handleUpdateChapterNumber,
  handleUpdateChapterStatus,
  handleUpdateChaptersOrder,
  handleUpdateParagraph,
  createHandleAnalyzeBatch,
  createHandleListProjectJobs,
  createHandleGetAnalysisJobStatus,
  createHandleCancelAnalysisJob,
  createHandleTranslateBatch,
  createHandleGetTranslateJobStatus,
  createHandleCancelTranslateJob,
  createHandleTranslateChapter,
} from './handlers/chapterRouteHandlers.js';

export function registerChapterRoutes(app: Application, deps: RouteDeps): void {
  app.get(
    '/api/projects/:projectId/chapters/:chapterId/status',
    requireAuth,
    requireRole('author'),
    handleGetChapterStatus
  );

  app.get(
    '/api/projects/:projectId/chapters/:chapterId',
    requireAuth,
    requireRole('author'),
    handleGetChapter
  );

  app.delete(
    '/api/projects/:projectId/chapters/:chapterId',
    requireAuth,
    requireRole('author'),
    handleDeleteChapter
  );

  app.post(
    '/api/projects/:projectId/chapters/duplicate',
    requireAuth,
    requireRole('author'),
    handleDuplicateChapters
  );

  app.post(
    '/api/projects/:projectId/chapters/bulk-delete',
    requireAuth,
    requireRole('author'),
    handleBulkDeleteChapters
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate/cancel',
    requireAuth,
    requireRole('author'),
    handleCancelTranslation
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate/sync',
    requireAuth,
    requireRole('author'),
    handleSyncTranslation
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/upload-translation',
    requireAuth,
    requireRole('author'),
    handleUploadTranslation
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/mark-as-translated',
    requireAuth,
    requireRole('author'),
    handleMarkAsTranslated
  );

  app.post(
    '/api/projects/:projectId/chapters/mark-as-translated-batch',
    requireAuth,
    requireRole('author'),
    handleMarkAsTranslatedBatch
  );

  app.post(
    '/api/projects/:projectId/chapters/analyze-batch',
    requireAuth,
    requireRole('author'),
    createHandleAnalyzeBatch(deps)
  );

  app.get(
    '/api/projects/:projectId/jobs',
    requireAuth,
    requireRole('author'),
    createHandleListProjectJobs(deps)
  );

  app.get(
    '/api/projects/:projectId/analysis-jobs/:jobId',
    requireAuth,
    requireRole('author'),
    createHandleGetAnalysisJobStatus(deps)
  );

  app.post(
    '/api/projects/:projectId/analysis-jobs/:jobId/cancel',
    requireAuth,
    requireRole('author'),
    createHandleCancelAnalysisJob(deps)
  );

  app.post(
    '/api/projects/:projectId/chapters/translate-batch',
    requireAuth,
    requireRole('author'),
    createHandleTranslateBatch(deps)
  );

  app.get(
    '/api/projects/:projectId/translate-jobs/:jobId',
    requireAuth,
    requireRole('author'),
    createHandleGetTranslateJobStatus(deps)
  );

  app.post(
    '/api/projects/:projectId/translate-jobs/:jobId/cancel',
    requireAuth,
    requireRole('author'),
    createHandleCancelTranslateJob(deps)
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate',
    requireAuth,
    requireRole('author'),
    createHandleTranslateChapter(deps)
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/critic',
    requireAuth,
    requireRole('author_plus'),
    handleChapterCritic
  );

  app.get(
    '/api/projects/:projectId/chapters/:chapterId/stats',
    requireAuth,
    requireRole('author'),
    handleGetChapterStats
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/title',
    requireAuth,
    requireRole('author'),
    handleUpdateChapterTitle
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/number',
    requireAuth,
    requireRole('author'),
    handleUpdateChapterNumber
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/status',
    requireAuth,
    requireRole('author'),
    handleUpdateChapterStatus
  );

  app.put(
    '/api/projects/:projectId/chapters/order',
    requireAuth,
    requireRole('author'),
    handleUpdateChaptersOrder
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId',
    requireAuth,
    requireRole('author'),
    handleUpdateParagraph
  );
}
