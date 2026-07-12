import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import type { RouteDeps } from './deps.js';
import {
  handleListTranslationRequestBoard,
  handleCreateTranslationRequestInterest,
  handleUpdateTranslationRequestInterestMe,
  handleWithdrawTranslationRequestInterest,
} from './handlers/translationRequestBoardHandlers.js';

export function registerTranslationRequestBoardRoutes(app: Application, _deps: RouteDeps): void {
  app.get(
    '/api/translation-requests/board',
    requireAuth,
    requireRole('author'),
    handleListTranslationRequestBoard
  );

  app.post(
    '/api/translation-requests/:id/interests',
    requireAuth,
    requireRole('author'),
    handleCreateTranslationRequestInterest
  );

  app.patch(
    '/api/translation-requests/:id/interests/me',
    requireAuth,
    requireRole('author'),
    handleUpdateTranslationRequestInterestMe
  );

  app.delete(
    '/api/translation-requests/:id/interests/me',
    requireAuth,
    requireRole('author'),
    handleWithdrawTranslationRequestInterest
  );
}
