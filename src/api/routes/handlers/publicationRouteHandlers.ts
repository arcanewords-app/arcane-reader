import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  publicEntityListQuerySchema,
  metadataUpdateBodySchema,
  exportDownloadQuerySchema,
  exportBodySchema,
  publicationsListQuerySchema,
  reportBodySchema,
  readingPositionBodySchema,
  publicationRatingBodySchema,
  publishBodySchema,
  buildExportsBodySchema,
  publicationDownloadQuerySchema,
  publicationDisplaySettingsBodySchema,
  newsListQuerySchema,
  announcementDismissSchema,
} from '../../schemas/index.js';
import {
  getProject,
  updateProject,
  getProjectFull,
  listPublicationsPublic,
  getPublicationBySlugOrId,
  getPublicationWithChapters,
  getPublicationChapterContent,
  getGlossaryForPublication,
  createOrUpdatePublication,
  unpublishProject,
  updatePublicationExportPaths,
  updatePublicationDisplaySettings,
  syncPublicationTranslationStatus,
  getUserPublications,
  getPublicationByProjectId,
  getProjectForPublicationExport,
  markChapterAsRead,
  getReadProgress,
  updateReadingPosition,
  createTranslationReport,
  listPublicEntities,
  getPublicEntityById,
  getPublicationRatingStatus,
  upsertPublicationRating,
  deletePublicationRating,
  listPublishedNewsPosts,
  getPublishedNewsPostByIdOrSlug,
  getActiveAnnouncementForUser,
  dismissAnnouncement,
  assertOwnedActiveTranslatorPseudonym,
} from '../../../services/supabaseDatabase.js';
import { INVALID_TRANSLATOR_PSEUDONYM_CODE } from '../../../shared/translatorPseudonyms.js';
import type { UserRole } from '../../../types/roles.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { logger } from '../../../logger.js';
import {
  isTranslationStatus,
  translationStatusFromMetadata,
  type TranslationStatus,
} from '../../../shared/translation-status.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { normalizeQueryRecord, requireRouteParam } from '../../validateRoute.js';
import { exportProject } from '../../../services/export/index.js';
import {
  uploadFile,
  deleteFile,
  deleteFiles,
  extractPathFromUrl,
  generateUniqueFilename,
  downloadFile,
  createSignedUrl,
  listFiles,
} from '../../../services/storage.js';
import { CACHE_PREFIX, CACHE_TTL } from '../../../shared/cacheContract.js';
import {
  buildRedisKey,
  redisDelMany,
  redisGetJson,
  redisSetJson,
} from '../../../services/redisCache.js';
import { invalidateProjectAndRelatedCaches } from '../../../services/cacheInvalidation.js';
import {
  withRedisCache,
  invalidateUserProjectCaches,
  invalidatePublicationCaches,
  invalidatePublicationListCaches,
  invalidateAnnouncementCaches,
  projectReportsCountCacheKey,
  readingHistoryCacheKey,
  publicationsListCacheKey,
  publicationCacheKey,
  publicationChaptersCacheKey,
  publicationChapterCacheKey,
  publicationGlossaryCacheKey,
  publicEntitiesCacheKey,
  publicEntityCacheKey,
  newsListCacheKey,
  newsPostCacheKey,
  announcementsActiveCacheKey,
} from '../../routeHelpers.js';

// Cyrillic (Russian/Ukrainian) to Latin transliteration for readable export filenames.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g', // Ukrainian
};
const CYRILLIC_RE = /[\u0400-\u04FF]/;

function transliterateCyrillic(text: string): string {
  return text
    .split('')
    .map((c) => {
      const lower = c.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (mapped !== undefined)
        return c === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      return CYRILLIC_RE.test(c) ? '_' : c;
    })
    .join('');
}

// Storage keys must be ASCII-safe (no Cyrillic etc.) to avoid "Invalid key" errors.
// Cyrillic is transliterated to Latin for readable names (e.g. "Зенит Колдовства" -> "Zenit_Koldovstva").
function sanitizeFilename(filename: string): string {
  const transliterated = transliterateCyrillic(filename);
  return (
    transliterated
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[\u0080-\uFFFF]/g, '_') // Replace remaining non-ASCII for storage compatibility
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, '') // Trim leading/trailing underscores
      .substring(0, 100) || // Limit length
    'export'
  ); // Fallback if empty after sanitization
}

export async function handleUploadCover(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      req.user.id,
      token
    );
    if (!project) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Delete old cover if exists
    if (project.metadata?.coverImageUrl) {
      const oldStoragePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
      if (oldStoragePath) {
        await deleteFile('images', oldStoragePath).catch((err) => {
          req.log?.error({ err }, 'Failed to delete old cover');
          // Continue even if deletion fails
        });
      }
    }

    // Upload to Supabase Storage
    const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
    const storagePath = generateUniqueFilename(
      'cover',
      ext,
      requireRouteParam(req.params.projectId, 'projectId')
    );

    const uploadResult = await uploadFile('images', storagePath, req.file.buffer, {
      contentType: req.file.mimetype,
    });

    const coverImageUrl = uploadResult.publicUrl;

    // Update project metadata with new cover
    // Ensure metadata object exists before spreading
    const updatedMetadata = {
      ...(project.metadata || {}),
      coverImageUrl,
    };

    req.log?.info(
      {
        event: 'cover.deps.upload.start',
        projectId: requireRouteParam(req.params.projectId, 'projectId'),
      },
      'Uploading cover for project'
    );

    const updatedProject = await updateProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      {
        metadata: updatedMetadata,
      },
      req.user.id,
      token
    );

    if (!updatedProject) {
      // Rollback: delete uploaded file if update failed
      await deleteFile('images', storagePath).catch((err) =>
        logger.error({ err, storagePath }, 'Failed to delete file from storage')
      );
      res.status(404).json({ error: 'Failed to update project' });
      return;
    }

    req.log?.info(
      {
        event: 'cover.deps.upload.done',
        projectId: requireRouteParam(req.params.projectId, 'projectId'),
      },
      'Cover saved to project'
    );

    await invalidateProjectAndRelatedCaches(
      req.user.id,
      requireRouteParam(req.params.projectId, 'projectId'),
      token
    );
    res.json({ coverImageUrl, project: updatedProject });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to upload cover image');
    res.status(500).json({ error: 'Failed to upload cover image' });
  }
}

export async function handleDeleteCover(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      req.user.id,
      token
    );
    if (!project) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Delete old cover if exists
    if (project.metadata?.coverImageUrl) {
      const oldStoragePath = extractPathFromUrl(project.metadata.coverImageUrl, 'images');
      if (oldStoragePath) {
        await deleteFile('images', oldStoragePath).catch((err) => {
          req.log?.error({ err }, 'Failed to delete old cover');
          // Continue even if deletion fails
        });
      }
    }

    // Upload to Supabase Storage
    const ext = path.extname(req.file.originalname).slice(1) || 'jpg';
    const storagePath = generateUniqueFilename(
      'cover',
      ext,
      requireRouteParam(req.params.projectId, 'projectId')
    );

    const uploadResult = await uploadFile('images', storagePath, req.file.buffer, {
      contentType: req.file.mimetype,
    });

    const coverImageUrl = uploadResult.publicUrl;

    // Update project metadata with new cover
    // Ensure metadata object exists before spreading
    const updatedMetadata = {
      ...(project.metadata || {}),
      coverImageUrl,
    };

    req.log?.info(
      {
        event: 'cover.deps.upload.start',
        projectId: requireRouteParam(req.params.projectId, 'projectId'),
      },
      'Uploading cover for project'
    );

    const updatedProject = await updateProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      {
        metadata: updatedMetadata,
      },
      req.user.id,
      token
    );

    if (!updatedProject) {
      // Rollback: delete uploaded file if update failed
      await deleteFile('images', storagePath).catch((err) =>
        logger.error({ err, storagePath }, 'Failed to delete file from storage')
      );
      res.status(404).json({ error: 'Failed to update project' });
      return;
    }

    req.log?.info(
      {
        event: 'cover.deps.upload.done',
        projectId: requireRouteParam(req.params.projectId, 'projectId'),
      },
      'Cover saved to project'
    );

    await invalidateProjectAndRelatedCaches(
      req.user.id,
      requireRouteParam(req.params.projectId, 'projectId'),
      token
    );
    res.json({ coverImageUrl, project: updatedProject });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to upload cover image');
    res.status(500).json({ error: 'Failed to upload cover image' });
  }
}

export async function handleUpdateProjectMetadata(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const project = await getProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      req.user.id,
      requireToken(req)
    );
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parsed = metadataUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { metadata: metadataUpdates } = parsed.data;

    if (Object.prototype.hasOwnProperty.call(metadataUpdates, 'translatorEntityId')) {
      const rawTranslatorId = metadataUpdates.translatorEntityId;
      if (rawTranslatorId != null && typeof rawTranslatorId === 'string') {
        try {
          await assertOwnedActiveTranslatorPseudonym(req.user.id, rawTranslatorId);
        } catch (err) {
          const code = (err as Error & { code?: string }).code;
          if (code === INVALID_TRANSLATOR_PSEUDONYM_CODE) {
            res.status(400).json({
              error: 'Invalid translator pseudonym',
              code: INVALID_TRANSLATOR_PSEUDONYM_CODE,
            });
            return;
          }
          throw err;
        }
      }
    }

    const updatedMetadata = { ...(project.metadata || {}), ...metadataUpdates };
    const updatedProject = await updateProject(
      requireRouteParam(req.params.projectId, 'projectId'),
      { metadata: updatedMetadata },
      req.user.id,
      requireToken(req)
    );

    if (!updatedProject) {
      res.status(404).json({ error: 'Failed to update project' });
      return;
    }

    const token = requireToken(req);
    if (Object.prototype.hasOwnProperty.call(metadataUpdates, 'translationStatus')) {
      const raw = metadataUpdates.translationStatus;
      const translationStatus =
        raw === null || raw === undefined ? null : isTranslationStatus(raw) ? raw : null;
      try {
        await syncPublicationTranslationStatus(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token,
          translationStatus
        );
        const publication = await getPublicationByProjectId(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (publication) {
          await invalidatePublicationCaches(publication.id, publication.id);
          if (publication.slug) {
            await invalidatePublicationCaches(publication.slug);
          }
          await invalidatePublicationListCaches();
        }
      } catch (syncErr) {
        req.log?.warn(
          { err: syncErr, projectId: requireRouteParam(req.params.projectId, 'projectId') },
          'Failed to sync publication translationStatus from metadata'
        );
      }
    } else if (Object.prototype.hasOwnProperty.call(metadataUpdates, 'isCompleteWork')) {
      const translationStatus = metadataUpdates.isCompleteWork === true ? 'complete' : null;
      try {
        await syncPublicationTranslationStatus(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token,
          translationStatus
        );
        const publication = await getPublicationByProjectId(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (publication) {
          await invalidatePublicationCaches(publication.id, publication.id);
          if (publication.slug) {
            await invalidatePublicationCaches(publication.slug);
          }
          await invalidatePublicationListCaches();
        }
      } catch (syncErr) {
        req.log?.warn(
          { err: syncErr, projectId: requireRouteParam(req.params.projectId, 'projectId') },
          'Failed to sync publication translationStatus from legacy isCompleteWork'
        );
      }
    }

    await invalidateProjectAndRelatedCaches(
      req.user.id,
      requireRouteParam(req.params.projectId, 'projectId'),
      token
    );
    res.json(updatedProject);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to update project metadata');
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update project metadata';
    res.status(500).json({ error: errorMessage });
  }
}

export async function handleExportProject(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = exportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { format, author } = parsed.data;
    const projectId = requireRouteParam(req.params.id, 'id');

    const token = requireToken(req);
    const project = await getProjectFull(projectId, req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Generate file in temporary directory
    // On Vercel, only /tmp is writable, so use it explicitly
    // On local, os.tmpdir() works fine
    const tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
    const filename = `${sanitizeFilename(project.name)}-${Date.now()}.${format}`;
    const tmpPath = path.join(tmpDir, filename);

    req.log?.info(
      {
        event: 'export.start',
        projectId: requireRouteParam(req.params.id, 'id'),
        projectName: project.name,
        format,
        tmpPath,
        tmpDir,
        vercel: !!process.env.VERCEL,
      },
      `Export started: ${project.name} -> ${format.toUpperCase()}`
    );

    // Ensure tmp directory exists (should already exist on Vercel, but safe to check)
    if (!fs.existsSync(tmpDir)) {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        req.log?.debug({ tmpDir }, 'Created temp directory');
      } catch (mkdirError: unknown) {
        const msg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
        req.log?.error({ err: mkdirError, tmpDir }, 'Failed to create temp directory');
        throw new Error(`Не удалось создать временную директорию: ${tmpDir}. Ошибка: ${msg}`);
      }
    } else {
      req.log?.debug({ tmpDir }, 'Temp directory exists');
    }

    try {
      // ============ Auto-clean old exports ============
      // We keep storage usage under control (Supabase bucket is limited).
      // Strategy:
      // - Delete exports older than EXPORT_RETENTION_DAYS
      // - Also keep only last EXPORT_KEEP_LATEST files per project
      const EXPORT_RETENTION_DAYS = 7;
      const EXPORT_KEEP_LATEST = 5;
      try {
        const folder = projectId;
        const files = await listFiles('exports', folder, { limit: 100 });

        const now = Date.now();
        const toTimestamp = (d?: string): number => {
          if (!d) return 0;
          const t = Date.parse(d);
          return Number.isFinite(t) ? t : 0;
        };

        const withTs = files
          // ignore pseudo-folders
          .filter((f) => f.name && !f.name.endsWith('/'))
          .map((f) => {
            const ts = Math.max(
              toTimestamp(f.created_at),
              toTimestamp(f.updated_at),
              toTimestamp(f.last_accessed_at)
            );
            return { ...f, __ts: ts };
          })
          .sort((a, b) => (b.__ts || 0) - (a.__ts || 0));

        const cutoff = now - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

        const oldByAge = withTs.filter((f) => (f.__ts || 0) > 0 && (f.__ts || 0) < cutoff);
        const oldByCount = withTs.slice(EXPORT_KEEP_LATEST);

        // De-duplicate by name
        const toDeleteNames = Array.from(new Set([...oldByAge, ...oldByCount].map((f) => f.name)));

        if (toDeleteNames.length > 0) {
          const paths = toDeleteNames.map((name) => `${folder}/${name}`);
          req.log?.debug(
            { pathsCount: paths.length, folder },
            'Auto-clean exports: deleting old files'
          );
          await deleteFiles('exports', paths);
        }
      } catch (cleanupErr) {
        // Cleanup must never break export itself
        req.log?.warn({ err: cleanupErr }, 'Auto-clean exports failed (continuing)');
      }

      // Export project to temporary file
      req.log?.debug('Generating file...');
      const exportedPath = await exportProject(project, {
        format,
        outputDir: tmpDir,
        filename,
        author,
      });

      req.log?.debug({ exportedPath }, 'File created');

      // Check if file exists
      if (!fs.existsSync(exportedPath)) {
        throw new Error(`Файл не был создан: ${exportedPath}`);
      }

      // Read file as buffer
      req.log?.debug('Reading file...');
      const fileBuffer = fs.readFileSync(exportedPath);
      req.log?.debug({ size: fileBuffer.length }, 'File read');

      // Upload to Supabase Storage (recommended for Vercel)
      const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';
      const storagePath = `${projectId}/${filename}`;

      req.log?.debug({ bucket: 'exports', storagePath }, 'Uploading to Supabase Storage');
      const uploaded = await uploadFile('exports', storagePath, fileBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

      // Prefer signed URL (works even if bucket is private)
      const { signedUrl } = await createSignedUrl('exports', storagePath, 60 * 30);

      // Clean up temporary file after upload
      try {
        fs.unlinkSync(exportedPath);
        req.log?.debug('Temp file removed');
      } catch (cleanupError) {
        req.log?.warn({ err: cleanupError }, 'Failed to remove temp file');
      }

      req.log?.info(
        {
          event: 'export.completed',
          projectId,
          projectName: project.name,
          format,
          filename,
          storagePath,
        },
        `Export completed: ${project.name} -> ${format.toUpperCase()} (${filename})`
      );

      // downloadUrl: same-origin proxy so browser downloads instead of opening (Content-Disposition: attachment)
      const downloadUrl = `/api/projects/${projectId}/export/download?path=${encodeURIComponent(storagePath)}`;

      res.json({
        success: true,
        format,
        filename,
        path: uploaded.path,
        url: signedUrl,
        publicUrl: uploaded.publicUrl,
        downloadUrl,
      });
      return;
    } catch (exportError) {
      // Clean up temporary file on error
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (_cleanupError) {
        // Ignore cleanup errors
      }
      throw exportError;
    }
  } catch (error: unknown) {
    req.log?.error({ err: error }, 'Export error');
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Failed to export project' });
  }
}

export async function handleExportDownload(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const projectId = requireRouteParam(req.params.id, 'id');
    const queryResult = exportDownloadQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }
    const pathParam = queryResult.data.path;

    const storagePath = decodeURIComponent(pathParam).replace(/^\/+/, '');

    if (!storagePath.startsWith(projectId + '/') || storagePath.includes('..')) {
      res.status(403).json({ error: 'Forbidden: invalid path' });
      return;
    }

    const project = await getProject(projectId, req.user.id, requireToken(req));
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const buffer = await downloadFile('exports', storagePath);
    const filename = storagePath.split('/').pop() || 'export';

    const contentType = filename.endsWith('.epub') ? 'application/epub+zip' : 'application/xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Download failed';
    req.log?.error({ err: error }, 'Export download error');
    res.status(500).json({ error: msg });
  }
}

export async function handleBuildPublicationExports(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = buildExportsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const formats = parsed.data.formats ?? ['epub', 'fb2'];

    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (pub.status !== 'published') {
      res.status(400).json({ error: 'Publication must be published' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(pub.projectId, req.user.id, token);
    if (!project) {
      res.status(403).json({ error: 'Forbidden: not the publication owner' });
      return;
    }

    const fullProject = await getProjectForPublicationExport(pub.projectId);
    if (!fullProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const translatedCount = fullProject.chapters.filter(
      (ch) =>
        (ch.status === 'completed' || ch.status === 'draft') &&
        (ch.translatedText || (ch.paragraphs && ch.paragraphs.some((p) => p.translatedText)))
    ).length;
    if (translatedCount === 0) {
      res.status(400).json({ error: 'Нет переведенных глав для экспорта' });
      return;
    }

    const publicationId = pub.id;
    const tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
    const title = pub.title || fullProject.name;
    const author = pub.translatorDisplay || pub.authorDisplay || fullProject.metadata?.authors?.[0];
    const exportBaseName =
      sanitizeFilename(pub.slug || pub.title || fullProject.name || 'book') || 'book';

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    let epubStoragePath: string | null = null;
    let fb2StoragePath: string | null = null;
    const folder = `publication-${publicationId}`;

    for (const format of formats) {
      if (format !== 'epub' && format !== 'fb2') continue;
      const ext = format;
      const filename = `${exportBaseName}.${ext}`;

      {
        const exportedPath = await exportProject(fullProject, {
          format,
          outputDir: tmpDir,
          filename,
          author: author ?? undefined,
        });

        if (!fs.existsSync(exportedPath)) {
          throw new Error(`Файл не был создан: ${exportedPath}`);
        }

        const fileBuffer = fs.readFileSync(exportedPath);
        const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';
        const storagePath = `${folder}/${filename}`;

        await uploadFile('exports', storagePath, fileBuffer, {
          contentType,
          cacheControl: '3600',
          upsert: true,
        });

        if (format === 'epub') epubStoragePath = storagePath;
        else fb2StoragePath = storagePath;

        try {
          fs.unlinkSync(exportedPath);
        } catch {
          /* ignore */
        }
      }
    }

    await updatePublicationExportPaths(publicationId, req.user.id, token, {
      epubStoragePath: formats.includes('epub') ? epubStoragePath : undefined,
      fb2StoragePath: formats.includes('fb2') ? fb2StoragePath : undefined,
    });

    await invalidatePublicationCaches(pub.id, pub.id);
    if (pub.slug) {
      await invalidatePublicationCaches(pub.slug);
    }

    req.log?.info(
      { event: 'build-exports.completed', publicationId, formats },
      `Build exports completed: ${title}`
    );

    const updatedPub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    res.json({
      epubReady: !!updatedPub?.epubStoragePath,
      fb2Ready: !!updatedPub?.fb2StoragePath,
    });
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Build exports error');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to build publication exports',
    });
  }
}

export async function handleUpdatePublicationDisplaySettings(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = publicationDisplaySettingsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No display settings to update' });
      return;
    }

    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (pub.status !== 'published') {
      res.status(400).json({ error: 'Publication must be published' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(pub.projectId, req.user.id, token);
    if (!project) {
      res.status(403).json({ error: 'Forbidden: not the publication owner' });
      return;
    }

    await updatePublicationDisplaySettings(pub.id, req.user.id, token, data);

    await invalidatePublicationCaches(pub.id, pub.id);
    if (pub.slug) {
      await invalidatePublicationCaches(pub.slug);
    }

    res.json({ success: true });
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to update publication';
    res.status(500).json({ error: msg });
  }
}

export async function handlePublicationDownload(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queryResult = publicationDownloadQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: queryResult.error.flatten().fieldErrors,
      });
      return;
    }
    const { format } = queryResult.data;

    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (pub.status !== 'published') {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const storagePath = format === 'epub' ? pub.epubStoragePath : pub.fb2StoragePath;
    if (!storagePath) {
      res.status(404).json({ error: 'Export not built yet' });
      return;
    }

    const buffer = await downloadFile('exports', storagePath);
    const filename = storagePath.split('/').pop() || `book.${format}`;

    const contentType = format === 'epub' ? 'application/epub+zip' : 'application/xml';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error: unknown) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Download failed';
    req.log?.error({ err: error }, 'Publication download error');
    res.status(500).json({ error: msg });
  }
}

export async function handleListPublicEntities(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = publicEntityListQuerySchema.safeParse({
      kind: req.query.kind,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { kind, search, limit, offset } = parseResult.data;
    const listOptions = { kind, search, limit, offset };
    const entities = search
      ? await listPublicEntities(listOptions)
      : await withRedisCache(publicEntitiesCacheKey(kind), CACHE_TTL.redisPublicEntitiesSec, () =>
          listPublicEntities(listOptions)
        );

    res.json(entities);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to list public entities';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublicEntity(req: Request, res: Response): Promise<void> {
  try {
    const key = publicEntityCacheKey(requireRouteParam(req.params.id, 'id'));
    const cached = await redisGetJson<Awaited<ReturnType<typeof getPublicEntityById>>>(key);
    if (cached) {
      res.json(cached);
      return;
    }
    const entity = await getPublicEntityById(requireRouteParam(req.params.id, 'id'));
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    await redisSetJson(key, entity, CACHE_TTL.redisPublicEntitySec);
    res.json(entity);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get public entity';
    res.status(500).json({ error: msg });
  }
}

export async function handleListNews(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = newsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const limit = parseResult.data.limit ?? 50;
    const offset = parseResult.data.offset ?? 0;
    const category = parseResult.data.category;
    const cacheKey = newsListCacheKey({ limit, offset, category });

    const list = await withRedisCache(cacheKey, CACHE_TTL.redisNewsListSec, () =>
      listPublishedNewsPosts({ limit, offset, category })
    );

    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to list news posts');
    res.status(500).json({ error: 'Failed to list news posts' });
  }
}

export async function handleGetNewsPost(req: Request, res: Response): Promise<void> {
  try {
    const idOrSlug = requireRouteParam(req.params.idOrSlug, 'idOrSlug');
    const post = await withRedisCache(newsPostCacheKey(idOrSlug), CACHE_TTL.redisNewsPostSec, () =>
      getPublishedNewsPostByIdOrSlug(idOrSlug)
    );
    if (!post) {
      res.status(404).json({ error: 'News post not found' });
      return;
    }
    res.json(post);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to get news post');
    res.status(500).json({ error: 'Failed to get news post' });
  }
}

export async function handleGetActiveAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    const userRole: UserRole = req.user?.role ?? 'guest';
    const userId = req.user?.id;
    const cacheKey = announcementsActiveCacheKey(userRole, userId);

    const alert = await withRedisCache(cacheKey, CACHE_TTL.redisAnnouncementsActiveSec, () =>
      getActiveAnnouncementForUser({ userRole, userId })
    );

    res.json(alert);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to get active announcement');
    res.status(500).json({ error: 'Failed to get active announcement' });
  }
}

export async function handleDismissAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = announcementDismissSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const token = requireToken(req);
    await dismissAnnouncement(
      req.user.id,
      requireRouteParam(req.params.id, 'id'),
      parseResult.data.contentVersion,
      token
    );
    await invalidateAnnouncementCaches();
    res.status(204).send();
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    req.log?.error({ err: error }, 'Failed to dismiss announcement');
    res.status(500).json({ error: 'Failed to dismiss announcement' });
  }
}

export async function handleListPublications(req: Request, res: Response): Promise<void> {
  try {
    const queryResult = publicationsListQuerySchema.safeParse(
      normalizeQueryRecord(req.query as Record<string, unknown>)
    );
    const params = queryResult.success
      ? {
          limit: Math.min(queryResult.data.limit ?? 50, 100),
          offset: Math.max(0, queryResult.data.offset ?? 0),
          orderBy: queryResult.data.orderBy ?? 'published_at',
          orderAsc: queryResult.data.orderAsc ?? false,
          authorEntityId: queryResult.data.author,
          translatorEntityId: queryResult.data.translator,
          tagEntityId: queryResult.data.tag,
        }
      : {
          limit: 50,
          offset: 0,
          orderBy: 'published_at' as const,
          orderAsc: false,
          authorEntityId: undefined,
          translatorEntityId: undefined,
          tagEntityId: undefined,
        };
    const list = await withRedisCache(
      publicationsListCacheKey({
        limit: params.limit,
        offset: params.offset,
        orderBy: params.orderBy,
        orderAsc: params.orderAsc,
        authorEntityId: params.authorEntityId,
        translatorEntityId: params.translatorEntityId,
        tagEntityId: params.tagEntityId,
      }),
      CACHE_TTL.redisPublicationsListSec,
      () =>
        listPublicationsPublic({
          limit: params.limit,
          offset: params.offset,
          orderBy: params.orderBy,
          orderAsc: params.orderAsc,
          authorEntityId: params.authorEntityId,
          translatorEntityId: params.translatorEntityId,
          tagEntityId: params.tagEntityId,
        })
    );
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to list publications';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublication(req: Request, res: Response): Promise<void> {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(requireRouteParam(req.params.id, 'id')),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'))
    );
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    res.json(pub);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublicationChapters(req: Request, res: Response): Promise<void> {
  try {
    const result = await withRedisCache(
      publicationChaptersCacheKey(requireRouteParam(req.params.id, 'id')),
      CACHE_TTL.redisPublicationChaptersSec,
      () => getPublicationWithChapters(requireRouteParam(req.params.id, 'id'))
    );
    if (!result) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublicationChapter(req: Request, res: Response): Promise<void> {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(requireRouteParam(req.params.id, 'id')),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'))
    );
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    const chapter = await withRedisCache(
      publicationChapterCacheKey(pub.id, requireRouteParam(req.params.chapterId, 'chapterId')),
      CACHE_TTL.redisPublicationChapterSec,
      () =>
        getPublicationChapterContent(pub.id, requireRouteParam(req.params.chapterId, 'chapterId'))
    );
    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }
    res.json(chapter);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get chapter';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublicationGlossary(req: Request, res: Response): Promise<void> {
  try {
    const pub = await withRedisCache(
      publicationCacheKey(requireRouteParam(req.params.id, 'id')),
      CACHE_TTL.redisPublicationSec,
      () => getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'))
    );
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (pub.showGlossary === false) {
      res.json([]);
      return;
    }
    const entries = await withRedisCache(
      publicationGlossaryCacheKey(pub.id),
      CACHE_TTL.redisPublicationGlossarySec,
      () => getGlossaryForPublication(pub.id)
    );
    res.json(entries);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get glossary';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetReadProgress(req: Request, res: Response): Promise<void> {
  try {
    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    const publicationId = pub.id;
    const userId = req.user?.id ?? null;
    const token = req.token ?? null;
    const progress = await getReadProgress(publicationId, userId, token);
    res.json({
      chapterIds: progress.chapterIds,
      lastReadChapterId: progress.lastReadChapterId ?? undefined,
      lastReadParagraphIndex: progress.lastReadParagraphIndex,
    });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get read progress';
    res.status(500).json({ error: msg });
  }
}

export async function handleReportPublication(req: Request, res: Response): Promise<void> {
  try {
    const slugOrId = requireRouteParam(req.params.id, 'id');
    const pub = await getPublicationBySlugOrId(slugOrId);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const parsed = reportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { chapterId, description } = parsed.data;

    const { id } = await createTranslationReport({
      publicationId: pub.id,
      chapterId,
      description,
      reporterUserId: req.user!.id,
      reporterIpHash: null,
    });

    // Invalidate reports count cache for publication's project
    await redisDelMany([projectReportsCountCacheKey(pub.projectId)]);

    res.json({ success: true, id });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to submit report';
    const status = msg.includes('wait') ? 429 : msg.includes('not found') ? 404 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function handleMarkChapterRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const chapterId = requireRouteParam(req.params.chapterId, 'chapterId');

    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    // Verify chapter belongs to publication's project
    const { createServiceRoleClient } = await import('../../../services/supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapter } = await serviceClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('project_id', pub.projectId)
      .single();

    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

    await markChapterAsRead(userId, pub.id, chapterId, token);
    await redisDelMany([
      readingHistoryCacheKey(userId),
      buildRedisKey(CACHE_PREFIX.userReadingProgress, userId, pub.id),
    ]);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to mark chapter as read';
    res.status(500).json({ error: msg });
  }
}

export async function handleUpdateReadingPosition(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const parsed = readingPositionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { chapterId, paragraphIndex = 0 } = parsed.data;

    const pub = await getPublicationBySlugOrId(requireRouteParam(req.params.id, 'id'));
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const { createServiceRoleClient } = await import('../../../services/supabaseClient.js');
    const serviceClient = createServiceRoleClient();
    const { data: chapter } = await serviceClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .eq('project_id', pub.projectId)
      .single();

    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

    await updateReadingPosition(userId, pub.id, chapterId, paragraphIndex, token);
    await redisDelMany([
      readingHistoryCacheKey(userId),
      buildRedisKey(CACHE_PREFIX.userReadingProgress, userId, pub.id),
    ]);
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to update reading position';
    res.status(500).json({ error: msg });
  }
}

export async function handlePublishProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const parsed = publishBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const body = parsed.data;
    const status = body.status ?? 'published';

    // Resolve author/translator from entity IDs if provided (project metadata or body)
    const project = await getProject(projectId, userId, token);
    const authorEntityId = body.authorEntityId ?? project?.metadata?.authorEntityId;
    const translatorEntityId = body.translatorEntityId ?? project?.metadata?.translatorEntityId;

    if (!translatorEntityId) {
      res.status(400).json({
        error: 'Translator pseudonym is required for publication',
        code: 'TRANSLATOR_PSEUDONYM_REQUIRED',
      });
      return;
    }

    let authorDisplay = body.authorDisplay;
    let translatorDisplay = body.translatorDisplay;

    if (authorEntityId) {
      try {
        const authorEntity = await getPublicEntityById(authorEntityId);
        if (authorEntity) authorDisplay = authorEntity.name;
      } catch {
        // Keep existing authorDisplay if entity fetch fails
      }
    }
    if (authorDisplay == null && project?.metadata?.authors?.[0]) {
      authorDisplay = project.metadata.authors[0];
    }

    if (translatorEntityId) {
      try {
        const translatorEntity = await assertOwnedActiveTranslatorPseudonym(
          userId,
          translatorEntityId
        );
        translatorDisplay = translatorEntity.name;
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        if (code === INVALID_TRANSLATOR_PSEUDONYM_CODE) {
          res.status(400).json({
            error: 'Invalid translator pseudonym',
            code: INVALID_TRANSLATOR_PSEUDONYM_CODE,
          });
          return;
        }
        throw err;
      }
    }

    let translationStatus: TranslationStatus | null | undefined = body.translationStatus;
    if (translationStatus === undefined && body.isCompleteWork === true) {
      translationStatus = 'complete';
    }
    if (translationStatus === undefined) {
      translationStatus = translationStatusFromMetadata(project?.metadata ?? null);
    }

    const publication = await createOrUpdatePublication(projectId, userId, token, {
      status,
      title: body.title,
      description: body.description,
      coverImageUrl: body.coverImageUrl,
      authorDisplay: authorDisplay ?? undefined,
      translatorDisplay: translatorDisplay ?? undefined,
      authorEntityId: authorEntityId ?? undefined,
      translatorEntityId: translatorEntityId ?? undefined,
      tagEntityIds: project?.metadata?.tagEntityIds ?? undefined,
      sourceLanguage: body.sourceLanguage,
      targetLanguage: body.targetLanguage,
      translationStatus,
      sourceUrl: body.sourceUrl,
    });
    await invalidateUserProjectCaches(userId, projectId);
    await invalidatePublicationCaches(publication.id, publication.id);
    if (publication.slug) {
      await invalidatePublicationCaches(publication.slug);
    }
    await invalidatePublicationListCaches();
    res.json(publication);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to publish';
    res.status(400).json({ error: msg });
  }
}

export async function handleUnpublishProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const ok = await unpublishProject(projectId, userId, token);
    if (!ok) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    await invalidateUserProjectCaches(userId, projectId);
    await invalidatePublicationListCaches();
    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to unpublish';
    res.status(400).json({ error: msg });
  }
}

export async function handleGetUserPublications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const list = await getUserPublications(userId, token);
    res.json(list);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publications';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetProjectPublication(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const pub = await getPublicationByProjectId(projectId, userId, token);
    res.json(pub);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
}

export async function handleGetPublicationRatingStatus(req: Request, res: Response): Promise<void> {
  try {
    const slugOrId = requireRouteParam(req.params.id, 'id');
    const pub = await getPublicationBySlugOrId(slugOrId);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const userId = req.user?.id ?? null;
    const token = req.token ?? null;
    const status = await getPublicationRatingStatus(pub.id, userId, token);
    res.json(status);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const msg = error instanceof Error ? error.message : 'Failed to get rating status';
    res.status(500).json({ error: msg });
  }
}

export async function handleUpsertPublicationRating(req: Request, res: Response): Promise<void> {
  try {
    const slugOrId = requireRouteParam(req.params.id, 'id');
    const pub = await getPublicationBySlugOrId(slugOrId);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const parsed = publicationRatingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const userId = req.user!.id;
    const token = req.token!;
    const result = await upsertPublicationRating(pub.id, userId, parsed.data.score, token);

    await invalidatePublicationCaches(pub.id, pub.id);
    if (pub.slug) {
      await invalidatePublicationCaches(pub.slug);
    }
    await invalidatePublicationListCaches();

    res.json(result);
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const { PublicationRatingError } =
      await import('../../../services/supabase/domains/publicationRatings.js');
    if (error instanceof PublicationRatingError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'OWN_WORK' || error.code === 'NOT_ELIGIBLE'
            ? 403
            : 401;
      res.status(status).json({ error: error.message, code: error.code });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Failed to save rating';
    res.status(500).json({ error: msg });
  }
}

export async function handleDeletePublicationRating(req: Request, res: Response): Promise<void> {
  try {
    const slugOrId = requireRouteParam(req.params.id, 'id');
    const pub = await getPublicationBySlugOrId(slugOrId);
    if (!pub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    const userId = req.user!.id;
    const token = req.token!;
    await deletePublicationRating(pub.id, userId, token);

    await invalidatePublicationCaches(pub.id, pub.id);
    if (pub.slug) {
      await invalidatePublicationCaches(pub.slug);
    }
    await invalidatePublicationListCaches();

    res.json({ success: true });
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const { PublicationRatingError } =
      await import('../../../services/supabase/domains/publicationRatings.js');
    if (error instanceof PublicationRatingError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'OWN_WORK' || error.code === 'NOT_ELIGIBLE'
            ? 403
            : 401;
      res.status(status).json({ error: error.message, code: error.code });
      return;
    }
    const msg = error instanceof Error ? error.message : 'Failed to remove rating';
    res.status(500).json({ error: msg });
  }
}
