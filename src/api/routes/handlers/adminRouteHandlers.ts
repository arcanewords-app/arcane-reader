import type { Request, Response } from 'express';
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
} from '../../schemas/index.js';
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
} from '../../../services/supabaseDatabase.js';
import { invalidateProfileCache } from '../../../middleware/auth.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { normalizeQueryRecord, requireRouteParam } from '../../validateRoute.js';
import { uploadFile, deleteFile, generateUniqueFilename } from '../../../services/storage.js';
import { CACHE_PREFIX } from '../../../shared/cacheContract.js';
import { buildRedisKey, redisDelMany } from '../../../services/redisCache.js';
import {
  invalidatePublicationCaches,
  invalidatePublicationListCaches,
  invalidateUserProjectCaches,
  invalidatePublicEntitiesCaches,
  invalidateNewsCaches,
  invalidateAnnouncementCaches,
} from '../../routeHelpers.js';

export async function handleCreatePublicEntity(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = publicEntityCreateSchema.safeParse({
      kind: req.body?.kind,
      name: req.body?.name,
      description: req.body?.description,
      photoUrl: req.body?.photoUrl,
    });

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
      return;
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

export async function handleUpdatePublicEntity(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const entityId = requireRouteParam(req.params.id, 'id');
    const existing = await getPublicEntityById(entityId);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const parseResult = publicEntityUpdateSchema.safeParse({
      name: req.body?.name,
      description: req.body?.description,
      photoUrl: req.body?.photoUrl,
    });

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const token = requireToken(req);
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

export async function handleDeletePublicEntity(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const entityId = requireRouteParam(req.params.id, 'id');
    const existing = await getPublicEntityById(entityId);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const usageCount = await countPublicationsUsingEntity(entityId);
    if (usageCount > 0) {
      res.status(409).json({
        error: 'Entity is used by publications',
        usageCount,
      });
      return;
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
}

export async function handleGetPublicEntityUsage(req: Request, res: Response): Promise<void> {
  try {
    const entityId = requireRouteParam(req.params.id, 'id');
    const existing = await getPublicEntityById(entityId);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const usageCount = await countPublicationsUsingEntity(entityId);
    res.json({ usageCount });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to get entity usage');
    res.status(500).json({ error: 'Failed to get entity usage' });
  }
}

export async function handleListAdminNews(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminNewsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleCreateNewsPost(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = newsCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleGetAdminNewsPost(req: Request, res: Response): Promise<void> {
  try {
    const post = await getNewsPostByIdAdmin(requireRouteParam(req.params.id, 'id'));
    if (!post) {
      res.status(404).json({ error: 'News post not found' });
      return;
    }
    res.json(post);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to get admin news post');
    res.status(500).json({ error: 'Failed to get news post' });
  }
}

export async function handleUpdateNewsPost(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = newsUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const postId = requireRouteParam(req.params.id, 'id');
    const existing = await getNewsPostByIdAdmin(postId);
    if (!existing) {
      res.status(404).json({ error: 'News post not found' });
      return;
    }

    const post = await updateNewsPost(postId, parseResult.data);
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
}

export async function handleDeleteNewsPost(req: Request, res: Response): Promise<void> {
  try {
    const postId = requireRouteParam(req.params.id, 'id');
    const existing = await getNewsPostByIdAdmin(postId);
    if (!existing) {
      res.status(404).json({ error: 'News post not found' });
      return;
    }

    await deleteNewsPost(postId);
    await invalidateNewsCaches(existing.slug ?? existing.id);
    res.status(204).send();
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const code = (error as Error & { code?: string }).code;
    if (code === 'NEWS_HAS_ACTIVE_ALERTS') {
      res.status(409).json({
        error: 'Cannot delete news post with active announcement alerts',
      });
      return;
    }
    req.log?.error({ err: error }, 'Failed to delete news post');
    res.status(500).json({ error: 'Failed to delete news post' });
  }
}

export async function handlePublishNewsPost(req: Request, res: Response): Promise<void> {
  try {
    const post = await publishNewsPost(requireRouteParam(req.params.id, 'id'));
    await invalidateNewsCaches(post.slug ?? post.id);
    res.json(post);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('not found') || message.includes('not a draft')) {
      res.status(400).json({ error: message });
      return;
    }
    req.log?.error({ err: error }, 'Failed to publish news post');
    res.status(500).json({ error: 'Failed to publish news post' });
  }
}

export function handleTranslateNewsPost(_req: Request, res: Response): void {
  res.status(501).json({ error: 'Not implemented' });
}

export async function handleListAnnouncementAlerts(req: Request, res: Response): Promise<void> {
  try {
    const list = await listAnnouncementAlertsAdmin();
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to list announcement alerts');
    res.status(500).json({ error: 'Failed to list announcement alerts' });
  }
}

export async function handleCreateAnnouncementAlert(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = announcementCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
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
      res.status(400).json({ error: 'Cannot create alert from unpublished news post' });
      return;
    }
    req.log?.error({ err: error }, 'Failed to create announcement alert');
    res.status(500).json({ error: 'Failed to create announcement alert' });
  }
}

export async function handleCreateAnnouncementFromNews(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = announcementFromNewsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { ctaLabel, ctaUrl, startsAt, endsAt, ...rest } = parseResult.data;
    const alert = await createAnnouncementFromNews(requireRouteParam(req.params.newsId, 'newsId'), {
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
      res.status(400).json({ error: 'Cannot create alert from unpublished news post' });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'News post not found' });
      return;
    }
    req.log?.error({ err: error }, 'Failed to create announcement from news');
    res.status(500).json({ error: 'Failed to create announcement alert' });
  }
}

export async function handleUpdateAnnouncementAlert(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = announcementUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
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
      res.status(404).json({ error: 'Announcement alert not found' });
      return;
    }
    req.log?.error({ err: error }, 'Failed to update announcement alert');
    res.status(500).json({ error: 'Failed to update announcement alert' });
  }
}

export async function handleDeleteAnnouncementAlert(req: Request, res: Response): Promise<void> {
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

export async function handleListAdminPublications(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminPublicationsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleUnpublishPublicationAdmin(req: Request, res: Response): Promise<void> {
  try {
    const publicationId = requireRouteParam(req.params.id, 'id');
    const ok = await unpublishPublicationAdmin(publicationId);
    if (!ok) {
      res.status(404).json({ error: 'Publication not found' });
      return;
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

export async function handleListAdminProjects(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminProjectsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleUnpublishProjectAdmin(req: Request, res: Response): Promise<void> {
  try {
    const projectId = requireRouteParam(req.params.id, 'id');
    const result = await unpublishProjectAdmin(projectId);
    if (!result) {
      res.status(404).json({ error: 'Project or publication not found' });
      return;
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

export async function handleDeleteProjectAdmin(req: Request, res: Response): Promise<void> {
  try {
    const projectId = requireRouteParam(req.params.id, 'id');
    const result = await deleteProjectAdmin(projectId);
    if (!result.deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
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
}

export async function handleListAdminUsers(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminUsersListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleUpdateUserRoleAdmin(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = adminUserRoleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const targetUserId = requireRouteParam(req.params.id, 'id');
    const { role } = parsed.data;

    const { data: currentProfile } = await (async () => {
      const { createServiceRoleClient } = await import('../../../services/supabaseClient.js');
      const client = createServiceRoleClient();
      return client.from('profiles').select('role').eq('id', targetUserId).single();
    })();

    if (!currentProfile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUserId === req.user.id && currentProfile.role === 'admin' && role !== 'admin') {
      res.status(400).json({ error: 'Cannot demote your own admin role' });
      return;
    }

    if (currentProfile.role === 'admin' && role !== 'admin') {
      const adminCount = await countAdminUsersWithRole('admin');
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot remove the last admin' });
        return;
      }
    }

    const updated = await updateUserRoleAdmin(targetUserId, role);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
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
}

export async function handleListAdminTranslationRequests(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const parsed = adminTranslationRequestsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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

export async function handleUpdateAdminTranslationRequest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const parsed = adminTranslationRequestUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
      res.status(404).json({ error: 'Translation request not found' });
      return;
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

export async function handleDeleteAdminTranslationRequest(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const requestId = requireRouteParam(req.params.id, 'id');
    const deleted = await deleteCatalogTranslationRequestAdmin(requestId);
    if (!deleted) {
      res.status(404).json({ error: 'Translation request not found' });
      return;
    }
    req.log?.info(
      {
        event: 'admin.translation_request.deleted',
        requestId,
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
      res.status(409).json({ error: 'Translation request cannot be deleted in current status' });
      return;
    }
    req.log?.error({ err: error }, 'Failed to delete admin translation request');
    res.status(500).json({ error: 'Failed to delete translation request' });
  }
}
