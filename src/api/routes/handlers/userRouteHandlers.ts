import type { Request, Response } from 'express';
import path from 'path';
import {
  profileUpdateBodySchema,
  tokenUsageQuerySchema,
  tokenUsageHistoryQuerySchema,
  catalogTranslationRequestCreateSchema,
  translatorPseudonymListQuerySchema,
  translatorPseudonymCreateSchema,
  translatorPseudonymUpdateSchema,
} from '../../schemas/index.js';
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
} from '../../../services/supabaseDatabase.js';
import { invalidateProfileCache } from '../../../middleware/auth.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { getUserTokenUsage, getTokenUsageHistory } from '../../../middleware/tokenLimits.js';
import { normalizeQueryRecord, requireRouteParam } from '../../validateRoute.js';
import { uploadFile, deleteFile, generateUniqueFilename } from '../../../services/storage.js';
import { CACHE_PREFIX, CACHE_TTL } from '../../../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../../../services/redisCache.js';
import {
  withRedisCache,
  tokenUsageCacheKey,
  tokenUsageHistoryCacheKey,
  readingHistoryCacheKey,
  invalidatePublicEntitiesCaches,
} from '../../routeHelpers.js';
import { translatorPseudonymErrorResponse } from './translatorPseudonymErrorResponse.js';

export async function handleGetTokenUsage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
}

export async function handleGetTokenUsageHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
}

export async function handleGetReadingHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
}

export async function handleCreateCatalogTranslationRequest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = catalogTranslationRequestCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
      res.status(409).json({ error: 'Too many pending translation requests' });
      return;
    }
    req.log?.error({ err: error }, 'Failed to create catalog translation request');
    res.status(500).json({ error: 'Failed to create translation request' });
  }
}

export async function handleListUserTranslationRequests(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const list = await listCatalogTranslationRequestsByUser(req.user.id, requireToken(req));
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to list user translation requests');
    res.status(500).json({ error: 'Failed to list translation requests' });
  }
}

export async function handleGetProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
}

export async function handleUpdateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = profileUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { avatarUrl } = parsed.data;
    const { createClientWithToken } = await import('../../../services/supabaseClient.js');
    const client = createClientWithToken(requireToken(req));
    const { data, error } = await client
      .from('profiles')
      .update({ avatar_url: avatarUrl === '' ? null : avatarUrl })
      .eq('id', req.user.id)
      .select('avatar_url')
      .single();
    if (error) {
      req.log?.error({ err: error }, 'Failed to update profile');
      res.status(500).json({ error: 'Failed to update profile' });
      return;
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
}

export async function handleUploadProfileAvatar(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
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
    const { createClientWithToken } = await import('../../../services/supabaseClient.js');
    const client = createClientWithToken(requireToken(req));
    const { data, error } = await client
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', req.user.id)
      .select('avatar_url')
      .single();
    if (error) {
      req.log?.error({ err: error }, 'Failed to update profile');
      res.status(500).json({ error: 'Failed to update profile' });
      return;
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

export async function handleGetUserReaderSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const reader = await getUserReaderSettings(req.user.id, token);
    if (!reader) {
      res.json(null);
      return;
    }
    res.json(reader);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to get reader settings' });
  }
}

export async function handleUpdateUserReaderSettings(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const reader = await updateUserReaderSettings(req.user.id, req.body, token);
    res.json(reader);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to update reader settings' });
  }
}

export async function handleListTranslatorPseudonyms(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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

export async function handleCreateTranslatorPseudonym(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = translatorPseudonymCreateSchema.safeParse({
      name: req.body?.name,
      description: req.body?.description,
    });
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
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

export async function handleUpdateTranslatorPseudonym(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const entityId = requireRouteParam(req.params.id, 'id');
    const existing = await getTranslatorPseudonymForUser(req.user.id, entityId);
    if (!existing) {
      res.status(404).json({ error: 'Translator pseudonym not found' });
      return;
    }

    const parseResult = translatorPseudonymUpdateSchema.safeParse({
      name: req.body?.name,
      description: req.body?.description,
      photoUrl: req.body?.photoUrl,
    });
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const updates: { name?: string; description?: string | null; photoUrl?: string | null } = {};
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

export async function handleHideTranslatorPseudonym(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
