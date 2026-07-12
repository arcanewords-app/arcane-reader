import type { Application } from 'express';
import { reportStatusSchema } from '../schemas/index.js';
import {
  getTranslationReportsCountByProject,
  getTranslationReportsByProject,
  updateTranslationReportStatus,
  deleteTranslationReport,
} from '../../services/supabase/domains/translationReports.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';
import { requireToken } from '../../utils/requestHelpers.js';
import { requireRouteParam } from '../validateRoute.js';
import { validationFailedResponse } from '../chapters/helpers/validationResponse.js';
import { redisDelMany } from '../../services/redisCache.js';
import { projectReportsCountCacheKey } from '../routeHelpers.js';

export function registerChapterReportRoutes(app: Application): void {
  app.get(
    '/api/projects/:id/reports-count',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        const token = requireToken(req);
        const projectId = requireRouteParam(req.params.id, 'id');

        const count = await getTranslationReportsCountByProject(projectId, userId, token);
        res.json({ count });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get reports count' });
      }
    }
  );

  app.get('/api/projects/:id/reports', requireAuth, requireRole('author'), async (req, res) => {
    try {
      const userId = req.user!.id;
      const token = requireToken(req);
      const projectId = requireRouteParam(req.params.id, 'id');

      const reports = await getTranslationReportsByProject(projectId, userId, token);
      res.json(reports);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get reports' });
    }
  });

  app.patch(
    '/api/projects/:id/reports/:reportId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        const token = requireToken(req);
        const projectId = requireRouteParam(req.params.id, 'id');
        const reportId = requireRouteParam(req.params.reportId, 'reportId');

        const parsed = reportStatusSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }

        await updateTranslationReportStatus(projectId, reportId, userId, token, parsed.data.status);
        await redisDelMany([projectReportsCountCacheKey(projectId)]);
        res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const msg = error instanceof Error ? error.message : 'Failed to update report';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.delete(
    '/api/projects/:id/reports/:reportId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        const userId = req.user!.id;
        const token = requireToken(req);
        const projectId = requireRouteParam(req.params.id, 'id');
        const reportId = requireRouteParam(req.params.reportId, 'reportId');

        await deleteTranslationReport(projectId, reportId, userId, token);
        await redisDelMany([projectReportsCountCacheKey(projectId)]);
        res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const msg = error instanceof Error ? error.message : 'Failed to delete report';
        res.status(400).json({ error: msg });
      }
    }
  );
}
