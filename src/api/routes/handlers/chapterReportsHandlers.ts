import type { Request, Response } from 'express';
import { reportStatusSchema } from '../../schemas/index.js';
import {
  deleteTranslationReport,
  getTranslationReportsByProject,
  getTranslationReportsCountByProject,
  updateTranslationReportStatus,
} from '../../../services/supabase/domains/translationReports.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { requireRouteParam } from '../../validateRoute.js';
import { validationFailedResponse } from '../../chapters/helpers/validationResponse.js';
import { redisDelMany } from '../../../services/redisCache.js';
import { projectReportsCountCacheKey } from '../../routeHelpers.js';

export async function handleGetReportsCount(req: Request, res: Response): Promise<void> {
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

export async function handleListReports(req: Request, res: Response): Promise<void> {
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
}

export async function handlePatchReportStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = requireToken(req);
    const projectId = requireRouteParam(req.params.id, 'id');
    const reportId = requireRouteParam(req.params.reportId, 'reportId');
    const parsed = reportStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationFailedResponse(parsed.error));
      return;
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

export async function handleDeleteReport(req: Request, res: Response): Promise<void> {
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
