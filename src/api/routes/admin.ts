import type { Application } from 'express';
import path from 'path';
import {
  publicEntityCreateSchema,
  publicEntityUpdateSchema,
  adminNewsListQuerySchema,
  newsCreateSchema,
  newsUpdateSchema,
  announcementCreateSchema,
  announcementUpdateSchema,
  announcementFromNewsSchema,
  adminPublicationsListQuerySchema,
  adminProjectsListQuerySchema,
  adminUsersListQuerySchema,
  adminUserRoleUpdateSchema,
  adminTranslationRequestsListQuerySchema,
  adminTranslationRequestUpdateSchema,
} from '../schemas/index.js';
import {
  createPublicEntity,
  updatePublicEntity,
  deletePublicEntity,
  countPublicationsUsingEntity,
  getPublicEntityById,
  listNewsPostsAdmin,
  getNewsPostByIdAdmin,
  createNewsPost,
  updateNewsPost,
  publishNewsPost,
  deleteNewsPost,
  listAnnouncementAlertsAdmin,
  createAnnouncementAlert,
  createAnnouncementFromNews,
  updateAnnouncementAlert,
  deleteAnnouncementAlert,
  listPublicationsAdmin,
  unpublishPublicationAdmin,
  listProjectsAdmin,
  unpublishProjectAdmin,
  deleteProjectAdmin,
  listUsersAdmin,
  updateUserRoleAdmin,
  countAdminUsersWithRole,
  listCatalogTranslationRequestsAdmin,
  updateCatalogTranslationRequestAdmin,
  deleteCatalogTranslationRequestAdmin,
} from '../../services/supabaseDatabase.js';

import { requireAuth, requireRole, invalidateProfileCache } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';

import { requireToken } from '../../utils/requestHelpers.js';

import { asUploadMiddleware } from '../../shared/multerCompat.js';
import { normalizeQueryRecord, requireRouteParam } from '../validateRoute.js';

import { uploadFile, deleteFile, generateUniqueFilename } from '../../services/storage.js';
import { CACHE_PREFIX } from '../../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../../services/redisCache.js';
import {
  invalidatePublicationCaches,
  invalidatePublicationListCaches,
  invalidateUserProjectCaches,
  invalidatePublicEntitiesCaches,
  invalidateNewsCaches,
  invalidateAnnouncementCaches,
} from '../routeHelpers.js';
import type { RouteDeps } from './deps.js';

export function registerAdminRoutes(app: Application, deps: RouteDeps): void {
  app.post(
    '/api/admin/entities',
    requireAuth,
    requireRole('admin'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parseResult = publicEntityCreateSchema.safeParse({
          kind: req.body?.kind,
          name: req.body?.name,
          description: req.body?.description,
          photoUrl: req.body?.photoUrl,
        });

        if (!parseResult.success) {
          return res.status(400).json({
            error: 'Invalid request body',
            details: parseResult.error.flatten(),
          });
        }

        const token = requireToken(req);
        const { kind, name, description } = parseResult.data;
        let photoUrl = parseResult.data.photoUrl ?? null;
        let uploadedStoragePath: string | null = null;

        if (req.file) {
          const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
          const storagePath = generateUniqueFilename(`public-entity-${kind}`, ext);
          uploadedStoragePath = storagePath;
          const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });
          photoUrl = uploaded.publicUrl;
        }

        try {
          const entity = await createPublicEntity(
            {
              kind,
              name,
              description,
              photoUrl,
              createdBy: req.user.id,
            },
            token
          );
          await invalidatePublicEntitiesCaches();
          res.status(201).json(entity);
        } catch (error) {
          if (uploadedStoragePath) {
            await deleteFile('images', uploadedStoragePath).catch((err) => {
              req.log?.error(
                { err, uploadedStoragePath },
                'Failed to rollback uploaded admin entity photo'
              );
            });
          }
          throw error;
        }
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to create public entity');
        res.status(500).json({ error: 'Failed to create public entity' });
      }
    }
  );

  app.patch(
    '/api/admin/entities/:id',
    requireAuth,
    requireRole('admin'),
    asUploadMiddleware(deps.uploadImage.single('photo')),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const entityId = requireRouteParam(req.params.id, 'id');
        const existing = await getPublicEntityById(entityId);
        if (!existing) {
          return res.status(404).json({ error: 'Entity not found' });
        }

        const parseResult = publicEntityUpdateSchema.safeParse({
          name: req.body?.name,
          description: req.body?.description,
          photoUrl: req.body?.photoUrl,
        });

        if (!parseResult.success) {
          return res.status(400).json({
            error: 'Invalid request body',
            details: parseResult.error.flatten(),
          });
        }

        const token = requireToken(req);
        const updates: { name?: string; description?: string | null; photoUrl?: string | null } =
          {};
        if (parseResult.data.name !== undefined) updates.name = parseResult.data.name;
        if (parseResult.data.description !== undefined)
          updates.description = parseResult.data.description;
        let photoUrl: string | null | undefined = parseResult.data.photoUrl;

        // Support removePhoto from FormData
        if (req.body?.removePhoto === 'true' || req.body?.removePhoto === true) {
          photoUrl = null;
        }

        if (req.file) {
          const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
          const storagePath = generateUniqueFilename(`public-entity-${existing.kind}`, ext);
          const uploaded = await uploadFile('images', storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
          });
          photoUrl = uploaded.publicUrl;
        }

        if (photoUrl !== undefined) updates.photoUrl = photoUrl;

        const entity = await updatePublicEntity(entityId, updates, token);
        await invalidatePublicEntitiesCaches(entityId);
        res.json(entity);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update public entity');
        res.status(500).json({ error: 'Failed to update public entity' });
      }
    }
  );

  app.delete('/api/admin/entities/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const entityId = requireRouteParam(req.params.id, 'id');
      const existing = await getPublicEntityById(entityId);
      if (!existing) {
        return res.status(404).json({ error: 'Entity not found' });
      }

      const usageCount = await countPublicationsUsingEntity(entityId);
      if (usageCount > 0) {
        return res.status(409).json({
          error: 'Entity is used by publications',
          usageCount,
        });
      }

      const token = requireToken(req);
      await deletePublicEntity(entityId, token);
      await invalidatePublicEntitiesCaches(entityId);
      res.status(204).send();
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to delete public entity');
      res.status(500).json({ error: 'Failed to delete public entity' });
    }
  });

  app.get('/api/admin/entities/:id/usage', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const entityId = requireRouteParam(req.params.id, 'id');
      const existing = await getPublicEntityById(entityId);
      if (!existing) {
        return res.status(404).json({ error: 'Entity not found' });
      }

      const usageCount = await countPublicationsUsingEntity(entityId);
      res.json({ usageCount });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to get entity usage');
      res.status(500).json({ error: 'Failed to get entity usage' });
    }
  });
  app.get('/api/admin/news', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parsed = adminNewsListQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { status, search, limit, offset } = parsed.data;
      const list = await listNewsPostsAdmin({
        status,
        search,
        limit: limit ?? 100,
        offset: offset ?? 0,
      });
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list admin news');
      res.status(500).json({ error: 'Failed to list news posts' });
    }
  });

  app.post('/api/admin/news', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parseResult = newsCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const token = requireToken(req);
      const post = await createNewsPost({ ...parseResult.data, createdBy: req.user.id }, token);
      await invalidateNewsCaches();
      res.status(201).json(post);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to create news post');
      res.status(500).json({ error: 'Failed to create news post' });
    }
  });

  app.get('/api/admin/news/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const post = await getNewsPostByIdAdmin(requireRouteParam(req.params.id, 'id'));
      if (!post) {
        return res.status(404).json({ error: 'News post not found' });
      }
      res.json(post);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to get admin news post');
      res.status(500).json({ error: 'Failed to get news post' });
    }
  });

  app.patch('/api/admin/news/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parseResult = newsUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const existing = await getNewsPostByIdAdmin(requireRouteParam(req.params.id, 'id'));
      if (!existing) {
        return res.status(404).json({ error: 'News post not found' });
      }

      const post = await updateNewsPost(requireRouteParam(req.params.id, 'id'), parseResult.data);
      await invalidateNewsCaches(existing.slug ?? existing.id);
      if (post.slug && post.slug !== existing.slug) {
        await invalidateNewsCaches(post.slug);
      }
      res.json(post);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update news post');
      res.status(500).json({ error: 'Failed to update news post' });
    }
  });

  app.delete('/api/admin/news/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const existing = await getNewsPostByIdAdmin(requireRouteParam(req.params.id, 'id'));
      if (!existing) {
        return res.status(404).json({ error: 'News post not found' });
      }

      await deleteNewsPost(requireRouteParam(req.params.id, 'id'));
      await invalidateNewsCaches(existing.slug ?? existing.id);
      res.status(204).send();
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const code = (error as Error & { code?: string }).code;
      if (code === 'NEWS_HAS_ACTIVE_ALERTS') {
        return res.status(409).json({
          error: 'Cannot delete news post with active announcement alerts',
        });
      }
      req.log?.error({ err: error }, 'Failed to delete news post');
      res.status(500).json({ error: 'Failed to delete news post' });
    }
  });

  app.post('/api/admin/news/:id/publish', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const post = await publishNewsPost(requireRouteParam(req.params.id, 'id'));
      await invalidateNewsCaches(post.slug ?? post.id);
      res.json(post);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const message = error instanceof Error ? error.message : '';
      if (message.includes('not found') || message.includes('not a draft')) {
        return res.status(400).json({ error: message });
      }
      req.log?.error({ err: error }, 'Failed to publish news post');
      res.status(500).json({ error: 'Failed to publish news post' });
    }
  });

  app.post('/api/admin/news/:id/translate', requireAuth, requireRole('admin'), (_req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });

  app.get('/api/admin/announcements', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const list = await listAnnouncementAlertsAdmin();
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list announcement alerts');
      res.status(500).json({ error: 'Failed to list announcement alerts' });
    }
  });

  app.post('/api/admin/announcements', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parseResult = announcementCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { newsPostId, ctaLabel, ctaUrl, startsAt, endsAt, ...rest } = parseResult.data;
      const alert = await createAnnouncementAlert({
        newsPostId: newsPostId ?? null,
        ctaLabel: ctaLabel ?? null,
        ctaUrl: ctaUrl ?? null,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        ...rest,
      });
      await invalidateAnnouncementCaches();
      res.status(201).json(alert);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const code = (error as Error & { code?: string }).code;
      if (code === 'NEWS_NOT_PUBLISHED') {
        return res.status(400).json({ error: 'Cannot create alert from unpublished news post' });
      }
      req.log?.error({ err: error }, 'Failed to create announcement alert');
      res.status(500).json({ error: 'Failed to create announcement alert' });
    }
  });

  app.post(
    '/api/admin/announcements/from-news/:newsId',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const parseResult = announcementFromNewsSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const { ctaLabel, ctaUrl, startsAt, endsAt, ...rest } = parseResult.data;
        const alert = await createAnnouncementFromNews(
          requireRouteParam(req.params.newsId, 'newsId'),
          {
            ctaLabel: ctaLabel ?? null,
            ctaUrl: ctaUrl ?? null,
            startsAt: startsAt ?? null,
            endsAt: endsAt ?? null,
            ...rest,
          }
        );
        await invalidateAnnouncementCaches();
        res.status(201).json(alert);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const code = (error as Error & { code?: string }).code;
        if (code === 'NEWS_NOT_PUBLISHED') {
          return res.status(400).json({ error: 'Cannot create alert from unpublished news post' });
        }
        if (error instanceof Error && error.message.includes('not found')) {
          return res.status(404).json({ error: 'News post not found' });
        }
        req.log?.error({ err: error }, 'Failed to create announcement from news');
        res.status(500).json({ error: 'Failed to create announcement alert' });
      }
    }
  );

  app.patch('/api/admin/announcements/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parseResult = announcementUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { ctaLabel, ctaUrl, startsAt, endsAt, newsPostId, contentVersion, ...rest } =
        parseResult.data;

      const alert = await updateAnnouncementAlert(requireRouteParam(req.params.id, 'id'), {
        ctaLabel,
        ctaUrl,
        startsAt,
        endsAt,
        newsPostId,
        contentVersion,
        ...rest,
      });
      await invalidateAnnouncementCaches();
      res.json(alert);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const message = error instanceof Error ? error.message : '';
      if (message.includes('not found')) {
        return res.status(404).json({ error: 'Announcement alert not found' });
      }
      req.log?.error({ err: error }, 'Failed to update announcement alert');
      res.status(500).json({ error: 'Failed to update announcement alert' });
    }
  });

  app.delete(
    '/api/admin/announcements/:id',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        await deleteAnnouncementAlert(requireRouteParam(req.params.id, 'id'));
        await invalidateAnnouncementCaches();
        res.status(204).send();
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to delete announcement alert');
        res.status(500).json({ error: 'Failed to delete announcement alert' });
      }
    }
  );

  app.get('/api/admin/publications', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parsed = adminPublicationsListQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { status, search, targetLanguage, limit, offset } = parsed.data;
      const list = await listPublicationsAdmin({
        status,
        search,
        targetLanguage,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list admin publications');
      res.status(500).json({ error: 'Failed to list publications' });
    }
  });

  app.post(
    '/api/admin/publications/:id/unpublish',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const publicationId = requireRouteParam(req.params.id, 'id');
        const ok = await unpublishPublicationAdmin(publicationId);
        if (!ok) {
          return res.status(404).json({ error: 'Publication not found' });
        }
        req.log?.info(
          { event: 'admin.publication.unpublish', publicationId, adminId: req.user?.id },
          'Admin unpublished publication'
        );
        await invalidatePublicationCaches(publicationId, publicationId);
        await invalidatePublicationListCaches();
        res.json({ ok: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to admin unpublish publication');
        res.status(500).json({ error: 'Failed to unpublish publication' });
      }
    }
  );

  app.get('/api/admin/projects', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parsed = adminProjectsListQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { search, publicationStatus, targetLanguage, limit, offset } = parsed.data;
      const list = await listProjectsAdmin({
        search,
        publicationStatus,
        targetLanguage,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list admin projects');
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  app.post(
    '/api/admin/projects/:id/unpublish',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const projectId = requireRouteParam(req.params.id, 'id');
        const result = await unpublishProjectAdmin(projectId);
        if (!result) {
          return res.status(404).json({ error: 'Project or publication not found' });
        }
        req.log?.info(
          {
            event: 'admin.project.unpublish',
            projectId,
            publicationId: result.publicationId,
            adminId: req.user?.id,
          },
          'Admin unpublished project'
        );
        await invalidatePublicationCaches(result.publicationId, result.publicationId);
        if (result.slug) {
          await invalidatePublicationCaches(result.slug);
        }
        await invalidatePublicationListCaches();
        res.json({ ok: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to admin unpublish project');
        res.status(500).json({ error: 'Failed to unpublish project' });
      }
    }
  );

  app.delete('/api/admin/projects/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const projectId = requireRouteParam(req.params.id, 'id');
      const result = await deleteProjectAdmin(projectId);
      if (!result.deleted) {
        return res.status(404).json({ error: 'Project not found' });
      }
      req.log?.info(
        { event: 'admin.project.delete', projectId, adminId: req.user?.id },
        'Admin deleted project'
      );
      if (result.userId) {
        await invalidateUserProjectCaches(result.userId, projectId);
      }
      if (result.publicationId) {
        await invalidatePublicationCaches(result.publicationId, result.publicationId);
        if (result.publicationSlug) {
          await invalidatePublicationCaches(result.publicationSlug);
        }
        await invalidatePublicationListCaches();
      }
      res.json({ ok: true });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to admin delete project');
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      const parsed = adminUsersListQuerySchema.safeParse(
        normalizeQueryRecord(req.query as Record<string, unknown>)
      );
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { search, limit, offset } = parsed.data;
      const list = await listUsersAdmin({
        search,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      res.json(list);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to list admin users');
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  app.patch('/api/admin/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const parsed = adminUserRoleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const targetUserId = requireRouteParam(req.params.id, 'id');
      const { role } = parsed.data;

      const { data: currentProfile } = await (async () => {
        const { createServiceRoleClient } = await import('../../services/supabaseClient.js');
        const client = createServiceRoleClient();
        return client.from('profiles').select('role').eq('id', targetUserId).single();
      })();

      if (!currentProfile) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUserId === req.user.id && currentProfile.role === 'admin' && role !== 'admin') {
        return res.status(400).json({ error: 'Cannot demote your own admin role' });
      }

      if (currentProfile.role === 'admin' && role !== 'admin') {
        const adminCount = await countAdminUsersWithRole('admin');
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last admin' });
        }
      }

      const updated = await updateUserRoleAdmin(targetUserId, role);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      await redisDelMany([buildRedisKey(CACHE_PREFIX.authProfile, targetUserId)]);
      invalidateProfileCache(targetUserId);
      req.log?.info(
        { event: 'admin.user.role', targetUserId, role, adminId: req.user.id },
        'Admin updated user role'
      );
      res.json(updated);
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      req.log?.error({ err: error }, 'Failed to update user role');
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  app.get(
    '/api/admin/translation-requests',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const parsed = adminTranslationRequestsListQuerySchema.safeParse(
          normalizeQueryRecord(req.query as Record<string, unknown>)
        );
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const { status, search, targetLanguage, limit, offset } = parsed.data;
        const list = await listCatalogTranslationRequestsAdmin({
          status,
          search,
          targetLanguage,
          limit: limit ?? 50,
          offset: offset ?? 0,
        });
        res.json(list);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to list admin translation requests');
        res.status(500).json({ error: 'Failed to list translation requests' });
      }
    }
  );

  app.patch(
    '/api/admin/translation-requests/:id',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const parsed = adminTranslationRequestUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Validation failed',
            details: parsed.error.flatten().fieldErrors,
          });
        }
        const updated = await updateCatalogTranslationRequestAdmin(
          requireRouteParam(req.params.id, 'id'),
          {
            status: parsed.data.status,
            adminNotes: parsed.data.adminNotes,
            linkedPublicationId: parsed.data.linkedPublicationId,
          }
        );
        if (!updated) {
          return res.status(404).json({ error: 'Translation request not found' });
        }
        req.log?.info(
          {
            event: 'admin.translation_request.updated',
            requestId: updated.id,
            adminId: req.user?.id,
          },
          'Admin updated translation request'
        );
        res.json(updated);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update admin translation request');
        res.status(500).json({ error: 'Failed to update translation request' });
      }
    }
  );

  app.delete(
    '/api/admin/translation-requests/:id',
    requireAuth,
    requireRole('admin'),
    async (req, res) => {
      try {
        const deleted = await deleteCatalogTranslationRequestAdmin(
          requireRouteParam(req.params.id, 'id')
        );
        if (!deleted) {
          return res.status(404).json({ error: 'Translation request not found' });
        }
        req.log?.info(
          {
            event: 'admin.translation_request.deleted',
            requestId: requireRouteParam(req.params.id, 'id'),
            adminId: req.user?.id,
          },
          'Admin deleted translation request'
        );
        res.status(204).send();
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        if (
          error instanceof Error &&
          (error as Error & { code?: string }).code === 'DELETE_FORBIDDEN'
        ) {
          return res
            .status(409)
            .json({ error: 'Translation request cannot be deleted in current status' });
        }
        req.log?.error({ err: error }, 'Failed to delete admin translation request');
        res.status(500).json({ error: 'Failed to delete translation request' });
      }
    }
  );
}
