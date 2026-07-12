import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  handleDeleteReport,
  handleGetReportsCount,
  handleListReports,
  handlePatchReportStatus,
} from './handlers/chapterReportsHandlers.js';

export function registerChapterReportRoutes(app: Application): void {
  app.get(
    '/api/projects/:id/reports-count',
    requireAuth,
    requireRole('author'),
    handleGetReportsCount
  );
  app.get('/api/projects/:id/reports', requireAuth, requireRole('author'), handleListReports);
  app.patch(
    '/api/projects/:id/reports/:reportId',
    requireAuth,
    requireRole('author'),
    handlePatchReportStatus
  );
  app.delete(
    '/api/projects/:id/reports/:reportId',
    requireAuth,
    requireRole('author'),
    handleDeleteReport
  );
}
