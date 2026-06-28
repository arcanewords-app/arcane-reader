import type { Application } from 'express';
import {
  profileUpdateBodySchema,
  tokenUsageQuerySchema,
  tokenUsageHistoryQuerySchema,
  catalogTranslationRequestCreateSchema,
} from '../schemas/index.js';
import {
  getUserReaderSettings,
  updateUserReaderSettings,
  getUserReadingHistory,
  createCatalogTranslationRequest,
  listCatalogTranslationRequestsByUser,
} from '../../services/supabaseDatabase.js';

import { requireAuth, invalidateProfileCache } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';

import { requireToken } from '../../utils/requestHelpers.js';
import { getUserTokenUsage, getTokenUsageHistory } from '../../middleware/tokenLimits.js';

import { asUploadMiddleware } from '../../shared/multerCompat.js';
import { normalizeQueryRecord } from '../validateRoute.js';

import { uploadFile } from '../../services/storage.js';
import { CACHE_PREFIX, CACHE_TTL } from '../../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../../services/redisCache.js';
import {
  withRedisCache,
  tokenUsageCacheKey,
  tokenUsageHistoryCacheKey,
  readingHistoryCacheKey,
} from '../routeHelpers.js';
import type { RouteDeps } from './deps.js';

export function registerUserRoutes(app: Application, deps: RouteDeps): void {
  app.get('/api/user/token-usage', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user;

      const queryResult = tokenUsageQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      const date =
        queryResult.success && queryResult.data.date
          ? queryResult.data.date
          : new Date().toISOString().split('T')[0];
      const usage = await withRedisCache(
        tokenUsageCacheKey(user.id, date),
        CACHE_TTL.redisTokenUsageSec,
        () => getUserTokenUsage(user.id, requireToken(req), date, user.role)
      );
      res.json(usage);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to get token usage';
      req.log?.error({ err: error }, 'Error getting token usage');
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/user/token-usage/history', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user;

      const queryResult = tokenUsageHistoryQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      const days = queryResult.success && queryResult.data.days ? queryResult.data.days : 7;
      const history = await withRedisCache(
        tokenUsageHistoryCacheKey(user.id, days),
        CACHE_TTL.redisTokenHistorySec,
        () => getTokenUsageHistory(user.id, requireToken(req), days, user.role)
      );
      res.json({ history });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get token usage history';
      req.log?.error({ err: error }, 'Error getting token usage history');
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/user/reading-history', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user;

      const items = await withRedisCache(
        readingHistoryCacheKey(user.id),
        CACHE_TTL.redisTokenHistorySec,
        () => getUserReadingHistory(user.id, requireToken(req))
      );
      res.json({ items });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to get reading history';
      req.log?.error({ err: error }, 'Error getting reading history');
      res.status(500).json({ error: errorMessage });
    }
  });

  // Catalog translation requests (user demand signal)
  app.post('/api/catalog/translation-requests', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = catalogTranslationRequestCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const body = parsed.data;
      const created = await createCatalogTranslationRequest(req.user.id, requireToken(req), {
        title: body.title,
        authorName: body.authorName,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
        comment: body.comment,
        sourceUrl: body.sourceUrl,
      });
      req.log?.info(
        {
          event: 'catalog.translation_request.created',
          requestId: created.id,
          userId: req.user.id,
        },
        'Catalog translation request created'
      );
      res.status(201).json(created);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      if (error instanceof Error && (error as Error & { code?: string }).code === 'PENDING_LIMIT') {
        return res.status(409).json({ error: 'Too many pending translation requests' });
      }
      req.log?.error({ err: error }, 'Failed to create catalog translation request');
      res.status(500).json({ error: 'Failed to create translation request' });
    }
  });

  app.get('/api/user/translation-requests', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const list = await listCatalogTranslationRequestsByUser(req.user.id, requireToken(req));
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list user translation requests');
      res.status(500).json({ error: 'Failed to list translation requests' });
    }
  });

  app.get('/api/user/profile', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.json({
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        avatarUrl: req.user.avatarUrl ?? null,
      });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to get profile';
      req.log?.error({ err: error }, 'Error getting profile');
      res.status(500).json({ error: errorMessage });
    }
  });

  app.put('/api/user/profile', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = profileUpdateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { avatarUrl } = parsed.data;
      const { createClientWithToken } = await import('../../services/supabaseClient.js');
      const client = createClientWithToken(requireToken(req));
      const { data, error } = await client
        .from('profiles')
        .update({ avatar_url: avatarUrl === '' ? null : avatarUrl })
        .eq('id', req.user.id)
        .select('avatar_url')
        .single();
      if (error) {
        req.log?.error({ err: error }, 'Failed to update profile');
        return res.status(500).json({ error: 'Failed to update profile' });
      }
      await redisDelMany([buildRedisKey(CACHE_PREFIX.authProfile, req.user.id)]);
      invalidateProfileCache(req.user.id);
      res.json({ avatarUrl: data?.avatar_url ?? null });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      req.log?.error({ err: error }, 'Error updating profile');
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post(
    '/api/user/profile/avatar',
    requireAuth,
    asUploadMiddleware(deps.uploadAvatar.single('avatar')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }
        const ext =
          req.file.mimetype === 'image/png'
            ? 'png'
            : req.file.mimetype === 'image/gif'
              ? 'gif'
              : req.file.mimetype === 'image/webp'
                ? 'webp'
                : 'jpg';
        const storagePath = `${req.user.id}/avatar.${ext}`;
        const { publicUrl } = await uploadFile('avatars', storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });
        const { createClientWithToken } = await import('../../services/supabaseClient.js');
        const client = createClientWithToken(requireToken(req));
        const { data, error } = await client
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', req.user.id)
          .select('avatar_url')
          .single();
        if (error) {
          req.log?.error({ err: error }, 'Failed to update profile');
          return res.status(500).json({ error: 'Failed to update profile' });
        }
        await redisDelMany([buildRedisKey(CACHE_PREFIX.authProfile, req.user.id)]);
        invalidateProfileCache(req.user.id);
        res.json({ avatarUrl: data?.avatar_url ?? null });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload avatar';
        req.log?.error({ err: error }, 'Error uploading avatar');
        res.status(500).json({ error: errorMessage });
      }
    }
  );
  app.get('/api/user/reader-settings', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const reader = await getUserReaderSettings(req.user.id, token);
      if (!reader) {
        return res.json(null);
      }
      res.json(reader);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to get reader settings' });
    }
  });

  app.put('/api/user/reader-settings', requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = requireToken(req);
      const reader = await updateUserReaderSettings(req.user.id, req.body, token);
      res.json(reader);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to update reader settings' });
    }
  });
}
