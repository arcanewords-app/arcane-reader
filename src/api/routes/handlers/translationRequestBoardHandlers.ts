import type { Request, Response } from 'express';
import {
  translationRequestBoardQuerySchema,
  translationRequestInterestCreateSchema,
  translationRequestInterestUpdateSchema,
} from '../../schemas/index.js';
import {
  listTranslationRequestsBoard,
  createTranslationRequestInterest,
  updateTranslationRequestInterestMe,
  withdrawTranslationRequestInterest,
} from '../../../services/supabaseDatabase.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { requireRouteParam } from '../../validateRoute.js';
import { interestErrorResponse } from '../helpers/interestErrorResponse.js';

export async function handleListTranslationRequestBoard(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = translationRequestBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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

export async function handleCreateTranslationRequestInterest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const requestId = requireRouteParam(req.params.id, 'id');
    const parsed = translationRequestInterestCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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

export async function handleUpdateTranslationRequestInterestMe(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const requestId = requireRouteParam(req.params.id, 'id');
    const parsed = translationRequestInterestUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const token = requireToken(req);
    const updated = await updateTranslationRequestInterestMe(
      requestId,
      req.user.id,
      token,
      parsed.data
    );
    if (!updated) {
      res.status(404).json({ error: 'Interest not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to update translation request interest');
    res.status(500).json({ error: 'Failed to update interest' });
  }
}

export async function handleWithdrawTranslationRequestInterest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const requestId = requireRouteParam(req.params.id, 'id');
    const token = requireToken(req);
    const ok = await withdrawTranslationRequestInterest(requestId, req.user.id, token);
    if (!ok) {
      res.status(404).json({ error: 'Interest not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to withdraw translation request interest');
    res.status(500).json({ error: 'Failed to withdraw interest' });
  }
}
