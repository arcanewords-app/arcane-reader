import type { Application } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asUploadMiddleware } from '../../shared/multerCompat.js';
import type { RouteDeps } from './deps.js';
import {
  handleGetTokenUsage,
  handleGetTokenUsageHistory,
  handleGetReadingHistory,
  handleGetUserQuotes,
  handleDeleteUserQuote,
  handleCreateCatalogTranslationRequest,
  handleListUserTranslationRequests,
  handleGetProfile,
  handleUpdateProfile,
  handleUploadProfileAvatar,
  handleGetUserReaderSettings,
  handleUpdateUserReaderSettings,
  handleListTranslatorPseudonyms,
  handleCreateTranslatorPseudonym,
  handleUpdateTranslatorPseudonym,
  handleHideTranslatorPseudonym,
} from './handlers/userRouteHandlers.js';

export function registerUserRoutes(app: Application, deps: RouteDeps): void {
  app.get('/api/user/token-usage', requireAuth, handleGetTokenUsage);
  app.get('/api/user/token-usage/history', requireAuth, handleGetTokenUsageHistory);
  app.get('/api/user/reading-history', requireAuth, handleGetReadingHistory);
  app.get('/api/user/quotes', requireAuth, handleGetUserQuotes);
  app.delete('/api/user/quotes/:quoteId', requireAuth, handleDeleteUserQuote);
  app.post('/api/catalog/translation-requests', requireAuth, handleCreateCatalogTranslationRequest);
  app.get('/api/user/translation-requests', requireAuth, handleListUserTranslationRequests);
  app.get('/api/user/profile', requireAuth, handleGetProfile);
  app.put('/api/user/profile', requireAuth, handleUpdateProfile);
  app.post(
    '/api/user/profile/avatar',
    requireAuth,
    asUploadMiddleware(deps.uploadAvatar.single('avatar')),
    handleUploadProfileAvatar
  );
  app.get('/api/user/reader-settings', requireAuth, handleGetUserReaderSettings);
  app.put('/api/user/reader-settings', requireAuth, handleUpdateUserReaderSettings);
  app.get(
    '/api/user/translator-pseudonyms',
    requireAuth,
    requireRole('author'),
    handleListTranslatorPseudonyms
  );
  app.post(
    '/api/user/translator-pseudonyms',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    handleCreateTranslatorPseudonym
  );
  app.patch(
    '/api/user/translator-pseudonyms/:id',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    handleUpdateTranslatorPseudonym
  );
  app.post(
    '/api/user/translator-pseudonyms/:id/hide',
    requireAuth,
    requireRole('author'),
    handleHideTranslatorPseudonym
  );
}
