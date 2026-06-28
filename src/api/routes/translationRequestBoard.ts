import type { Application } from 'express';
import {
  translationRequestBoardQuerySchema,
  translationRequestInterestCreateSchema,
  translationRequestInterestUpdateSchema,
} from '../schemas/index.js';
import {
  listTranslationRequestsBoard,
  createTranslationRequestInterest,
  updateTranslationRequestInterestMe,
  withdrawTranslationRequestInterest,
} from '../../services/supabaseDatabase.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';
import { requireToken } from '../../utils/requestHelpers.js';
import { requireRouteParam } from '../validateRoute.js';
import type { RouteDeps } from './deps.js';

function interestErrorResponse(error: unknown, res: import('express').Response): boolean {
  const code = (error as Error & { code?: string }).code;
  if (code === 'NOT_FOUND') {
    res.status(404).json({ error: 'Translation request not found' });
    return true;
  }
  if (code === 'SELF_ASSIGN') {
    res
      .status(409)
      .json({ error: 'Cannot take your own translation request', code: 'SELF_ASSIGN' });
    return true;
  }
  if (code === 'REQUEST_CLOSED') {
    res.status(409).json({ error: 'Translation request is not open', code: 'REQUEST_CLOSED' });
    return true;
  }
  if (code === 'INTEREST_EXISTS') {
    res.status(409).json({ error: 'Interest already exists', code: 'INTEREST_EXISTS' });
    return true;
  }
  if (code === 'INVALID_TRANSLATOR') {
    res.status(400).json({ error: 'Invalid translator entity', code: 'INVALID_TRANSLATOR' });
    return true;
  }
  return false;
}

export function registerTranslationRequestBoardRoutes(app: Application, _deps: RouteDeps): void {
  app.get(
    '/api/translation-requests/board',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const parsed = translationRequestBoardQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const q = parsed.data;
        const list = await listTranslationRequestsBoard(req.user.id, {
          status: q.status,
          search: q.search,
          targetLanguage: q.targetLanguage,
          mine: q.mine,
          limit: q.limit,
          offset: q.offset,
        });
        res.json(list);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to list translation request board');
        res.status(500).json({ error: 'Failed to list translation requests' });
      }
    }
  );

  app.post(
    '/api/translation-requests/:id/interests',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const requestId = requireRouteParam(req.params.id, 'id');
        const parsed = translationRequestInterestCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const token = requireToken(req);
        const interest = await createTranslationRequestInterest(
          requestId,
          req.user.id,
          token,
          parsed.data.translatorEntityId
        );
        res.status(201).json(interest);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        if (interestErrorResponse(error, res)) return;
        req.log?.error({ err: error }, 'Failed to create translation request interest');
        res.status(500).json({ error: 'Failed to create interest' });
      }
    }
  );

  app.patch(
    '/api/translation-requests/:id/interests/me',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const requestId = requireRouteParam(req.params.id, 'id');
        const parsed = translationRequestInterestUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const token = requireToken(req);
        const updated = await updateTranslationRequestInterestMe(
          requestId,
          req.user.id,
          token,
          parsed.data
        );
        if (!updated) {
          return res.status(404).json({ error: 'Interest not found' });
        }
        res.json(updated);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update translation request interest');
        res.status(500).json({ error: 'Failed to update interest' });
      }
    }
  );

  app.delete(
    '/api/translation-requests/:id/interests/me',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const requestId = requireRouteParam(req.params.id, 'id');
        const token = requireToken(req);
        const ok = await withdrawTranslationRequestInterest(requestId, req.user.id, token);
        if (!ok) {
          return res.status(404).json({ error: 'Interest not found' });
        }
        res.status(204).send();
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to withdraw translation request interest');
        res.status(500).json({ error: 'Failed to withdraw interest' });
      }
    }
  );
}
