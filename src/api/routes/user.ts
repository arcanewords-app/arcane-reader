import type { Application } from 'express';
import path from 'path';
import {
  profileUpdateBodySchema,
  tokenUsageQuerySchema,
  tokenUsageHistoryQuerySchema,
  catalogTranslationRequestCreateSchema,
  translatorPseudonymListQuerySchema,
  translatorPseudonymCreateSchema,
  translatorPseudonymUpdateSchema,
} from '../schemas/index.js';
import {
  getUserReaderSettings,
  updateUserReaderSettings,
  getUserReadingHistory,
  createCatalogTranslationRequest,
  listCatalogTranslationRequestsByUser,
  listTranslatorPseudonymsForUser,
  createTranslatorPseudonymForUser,
  updateTranslatorPseudonymForUser,
  hideTranslatorPseudonymForUser,
  getTranslatorPseudonymForUser,
} from '../../services/supabaseDatabase.js';

import { requireAuth, requireRole, invalidateProfileCache } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';

import { requireToken } from '../../utils/requestHelpers.js';
import { getUserTokenUsage, getTokenUsageHistory } from '../../middleware/tokenLimits.js';

import { asUploadMiddleware } from '../../shared/multerCompat.js';
import { normalizeQueryRecord, requireRouteParam } from '../validateRoute.js';

import { uploadFile, deleteFile, generateUniqueFilename } from '../../services/storage.js';
import { CACHE_PREFIX, CACHE_TTL } from '../../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../../services/redisCache.js';
import {
  withRedisCache,
  tokenUsageCacheKey,
  tokenUsageHistoryCacheKey,
  readingHistoryCacheKey,
  invalidatePublicEntitiesCaches,
} from '../routeHelpers.js';
import {
  TRANSLATOR_PSEUDONYM_LIMIT_CODE,
  INVALID_TRANSLATOR_PSEUDONYM_CODE,
} from '../../shared/translatorPseudonyms.js';
import type { RouteDeps } from './deps.js';

function translatorPseudonymErrorResponse(
  error: unknown,
  res: import('express').Response
): boolean {
  const code = (error as Error & { code?: string }).code;
  if (code === TRANSLATOR_PSEUDONYM_LIMIT_CODE) {
    const e = error as Error & { limit?: number; current?: number };
    res.status(409).json({
      error: 'Translator pseudonym limit reached',
      code: TRANSLATOR_PSEUDONYM_LIMIT_CODE,
      limit: e.limit,
      current: e.current,
    });
    return true;
  }
  if (code === INVALID_TRANSLATOR_PSEUDONYM_CODE) {
    res.status(400).json({
      error: 'Invalid translator pseudonym',
      code: INVALID_TRANSLATOR_PSEUDONYM_CODE,
    });
    return true;
  }
  return false;
}

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

  app.get(
    '/api/user/translator-pseudonyms',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const queryResult = translatorPseudonymListQuerySchema.safeParse(
          normalizeQueryRecord(req.query as Record<string, unknown>)
        );
        const includeHidden = queryResult.success ? queryResult.data.includeHidden : false;
        const list = await listTranslatorPseudonymsForUser(req.user.id, { includeHidden });
        res.json(list);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to list translator pseudonyms');
        res.status(500).json({ error: 'Failed to list translator pseudonyms' });
      }
    }
  );

  app.post(
    '/api/user/translator-pseudonyms',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parseResult = translatorPseudonymCreateSchema.safeParse({
          name: req.body?.name,
          description: req.body?.description,
        });
        if (!parseResult.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const token = requireToken(req);
        const { name, description } = parseResult.data;
        let photoUrl: string | null = null;
        let uploadedStoragePath: string | null = null;

        if (req.file) {
          const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
          const storagePath = generateUniqueFilename('translator-pseudonym', ext);
          uploadedStoragePath = storagePath;
          const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });
          photoUrl = uploaded.publicUrl;
        }

        try {
          const entity = await createTranslatorPseudonymForUser(
            req.user.id,
            { name, description, photoUrl },
            token
          );
          await invalidatePublicEntitiesCaches();
          res.status(201).json(entity);
        } catch (error) {
          if (uploadedStoragePath) {
            await deleteFile('images', uploadedStoragePath).catch((err) => {
              req.log?.error(
                { err, uploadedStoragePath },
                'Failed to rollback uploaded translator pseudonym photo'
              );
            });
          }
          if (translatorPseudonymErrorResponse(error, res)) return;
          throw error;
        }
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to create translator pseudonym');
        res.status(500).json({ error: 'Failed to create translator pseudonym' });
      }
    }
  );

  app.patch(
    '/api/user/translator-pseudonyms/:id',
    requireAuth,
    requireRole('author'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const entityId = requireRouteParam(req.params.id, 'id');
        const existing = await getTranslatorPseudonymForUser(req.user.id, entityId);
        if (!existing) {
          return res.status(404).json({ error: 'Translator pseudonym not found' });
        }

        const parseResult = translatorPseudonymUpdateSchema.safeParse({
          name: req.body?.name,
          description: req.body?.description,
          photoUrl: req.body?.photoUrl,
        });
        if (!parseResult.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const updates: { name?: string; description?: string | null; photoUrl?: string | null } =
          {};
        if (parseResult.data.name !== undefined) updates.name = parseResult.data.name;
        if (parseResult.data.description !== undefined)
          updates.description = parseResult.data.description;

        let photoUrl: string | null | undefined = parseResult.data.photoUrl;
        if (req.body?.removePhoto === 'true' || req.body?.removePhoto === true) {
          photoUrl = null;
        }
        if (req.file) {
          const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
          const storagePath = generateUniqueFilename('translator-pseudonym', ext);
          const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });
          photoUrl = uploaded.publicUrl;
        }
        if (photoUrl !== undefined) updates.photoUrl = photoUrl;

        const entity = await updateTranslatorPseudonymForUser(req.user.id, entityId, updates);
        await invalidatePublicEntitiesCaches(entityId);
        res.json(entity);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        if (translatorPseudonymErrorResponse(error, res)) return;
        req.log?.error({ err: error }, 'Failed to update translator pseudonym');
        res.status(500).json({ error: 'Failed to update translator pseudonym' });
      }
    }
  );

  app.post(
    '/api/user/translator-pseudonyms/:id/hide',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const entityId = requireRouteParam(req.params.id, 'id');
        const entity = await hideTranslatorPseudonymForUser(req.user.id, entityId);
        await invalidatePublicEntitiesCaches(entityId);
        res.json(entity);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        if (translatorPseudonymErrorResponse(error, res)) return;
        req.log?.error({ err: error }, 'Failed to hide translator pseudonym');
        res.status(500).json({ error: 'Failed to hide translator pseudonym' });
      }
    }
  );
}
