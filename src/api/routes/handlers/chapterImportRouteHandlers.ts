import type { Request, Response } from 'express';
import { getProject, updateProject } from '../../../services/supabase/domains/projects.js';
import { importChaptersBatch, getChapter } from '../../../services/supabase/domains/chapters.js';
import { handleServiceError } from '../../../middleware/serviceHealth.js';
import { requireToken } from '../../../utils/requestHelpers.js';
import { requireRouteParam } from '../../validateRoute.js';
import {
  parseFile,
  parseEpubLazy,
  isSupportedFormat,
  getProjectTypeFromFormat,
} from '../../../services/import/index.js';
import type { ParseResult } from '../../../services/import/index.js';
import type { ImportJobState } from '../../../services/importJobStore.js';
import { uploadFile } from '../../../services/storage.js';
import {
  generateImportJobId,
  toPublicImportJob,
  decodeMultipartFilename,
  IMPORT_JOB_FORMATS,
  IMPORT_JOB_TTL_SECONDS,
  IMPORT_CHAPTER_BATCH_SIZE,
  invalidateUserProjectCaches,
} from '../../routeHelpers.js';
import {
  appendChapterCountWarning,
  buildMultiChapterImportResponse,
  flushImportBatch,
  resolveImportMetadataUpdate,
  shouldUpdateProjectType,
} from '../../chapters/helpers/importPipeline.js';
import { buildImportCoverPath } from '../../chapters/helpers/importCoverPath.js';
import { runAsyncImportJob } from '../../chapters/helpers/asyncImportJob.js';
import {
  isJobOwnedByUser,
  setJobPollingNoStoreHeaders,
} from '../../chapters/helpers/jobPolling.js';
import type { RouteDeps } from '../deps.js';

export function createHandleStartImportJob(deps: RouteDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = requireToken(req);
      const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const filename =
        typeof req.body?.filename === 'string' && req.body.filename.trim()
          ? req.body.filename.trim()
          : decodeMultipartFilename(req.file.originalname);
      const extension = (filename.toLowerCase().split('.').pop() || '') as
        'epub' | 'fb2' | 'csv' | 'txt';

      if (!isSupportedFormat(filename)) {
        res.status(400).json({
          error: 'Неподдерживаемый формат файла',
          details: 'Поддерживаемые форматы: .txt, .epub, .fb2, .csv',
        });
        return;
      }

      if (!IMPORT_JOB_FORMATS.has(extension)) {
        res.status(400).json({
          error: 'Формат должен загружаться через обычный endpoint',
          details: 'Job-based импорт поддерживается только для .epub, .fb2, .csv',
        });
        return;
      }

      const jobId = generateImportJobId();
      const job: ImportJobState = {
        jobId,
        projectId: requireRouteParam(req.params.id, 'id'),
        userId: req.user.id,
        status: 'queued',
        phase: null,
        format: extension as 'epub' | 'fb2' | 'csv',
        filename,
        current: 0,
        total: 0,
        warnings: [],
        errors: [],
        chapters: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        cancelRequested: false,
      };
      await deps.importJobStore.createJob(job);
      await deps.importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);

      res.status(202).json({ jobId, status: 'queued' as const });

      const projectId = requireRouteParam(req.params.id, 'id');
      const userId = req.user.id;
      const buffer = req.file.buffer;

      setImmediate(() => {
        void runAsyncImportJob({
          jobId,
          projectId,
          userId,
          token,
          buffer,
          filename,
          extension: extension as 'epub' | 'fb2' | 'csv',
          project,
          importJobStore: deps.importJobStore,
          log: req.log,
        });
      });
    } catch (error) {
      if (handleServiceError(error, req, res)) return;
      const message = error instanceof Error ? error.message : 'Failed to start import job';
      if (message.includes('Token is required') || message.includes('Invalid token')) {
        res.status(401).json({ error: message });
        return;
      }
      req.log?.error(
        { err: error, projectId: requireRouteParam(req.params.id, 'id') },
        'Failed to start import job'
      );
      res.status(500).json({
        error: 'Failed to start import job',
        details: message,
      });
    }
  };
}

export function createHandleGetImportJobStatus(deps: RouteDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const job = await deps.importJobStore.getJob(requireRouteParam(req.params.jobId, 'jobId'));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    if (!isJobOwnedByUser(job, req.user.id, requireRouteParam(req.params.id, 'id'))) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    setJobPollingNoStoreHeaders(res);
    const compact = req.query.compact === '1' || req.query.compact === 'true';
    res.json(toPublicImportJob(job, { compact }));
  };
}

export function createHandleCancelImportJob(deps: RouteDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const job = await deps.importJobStore.getJob(requireRouteParam(req.params.jobId, 'jobId'));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    if (!isJobOwnedByUser(job, req.user.id, requireRouteParam(req.params.id, 'id'))) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
      res.json({ success: true });
      return;
    }
    await deps.importJobStore.requestCancel(requireRouteParam(req.params.jobId, 'jobId'));
    res.json({ success: true });
  };
}

export async function handleSyncChapterImport(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = requireToken(req);
    const project = await getProject(requireRouteParam(req.params.id, 'id'), req.user.id, token);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const filename =
      typeof req.body?.filename === 'string' && req.body.filename.trim()
        ? req.body.filename.trim()
        : decodeMultipartFilename(req.file.originalname);

    if (!isSupportedFormat(filename)) {
      res.status(400).json({
        error: 'Неподдерживаемый формат файла',
        details: 'Поддерживаемые форматы: .txt, .epub, .fb2, .csv',
      });
      return;
    }

    const isEpub = filename.toLowerCase().endsWith('.epub');

    if (isEpub) {
      let lazyResult;
      try {
        lazyResult = await parseEpubLazy(req.file.buffer);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'File parse error';
        req.log?.error({ err: parseError }, 'Parse error');
        res.status(400).json({
          error: 'Ошибка при парсинге файла',
          details: errorMessage,
          parseErrors: [errorMessage],
        });
        return;
      }

      if (lazyResult.errors.length > 0) {
        req.log?.error({ parseErrors: lazyResult.errors }, 'Parse errors');
        res.status(400).json({
          error: 'Ошибки при парсинге файла',
          details: lazyResult.errors.join('; '),
          parseErrors: lazyResult.errors,
          warnings: lazyResult.warnings,
        });
        return;
      }

      if (lazyResult.chapterCount === 0) {
        res.status(400).json({
          error: 'Файл не содержит глав',
          details: 'Не удалось извлечь ни одной главы из файла',
        });
        return;
      }

      const detectedType = getProjectTypeFromFormat('epub');
      const isFirstChapter = project.chapters.length === 0;
      const needsTypeUpdate = shouldUpdateProjectType(project.type, detectedType);

      if (isFirstChapter && needsTypeUpdate) {
        await updateProject(
          requireRouteParam(req.params.id, 'id'),
          { type: detectedType },
          req.user.id,
          token
        );
      }

      const projectId = requireRouteParam(req.params.id, 'id');

      if (isFirstChapter) {
        const metadataUpdate = await resolveImportMetadataUpdate(
          project.metadata,
          lazyResult.metadata,
          projectId,
          uploadFile,
          {
            buildCoverPath: buildImportCoverPath,
            onCoverError: (coverError) =>
              req.log?.error({ err: coverError }, 'Failed to save cover image'),
          }
        );
        if (metadataUpdate) {
          await updateProject(projectId, { metadata: metadataUpdate }, req.user.id, token);
        }
      }

      const chapterCountWarnings = appendChapterCountWarning(
        [...lazyResult.warnings],
        lazyResult.chapterCount
      );

      const importedRows: Array<{
        sourceIndex: number;
        chapterId: string;
        number: number;
        title: string;
        paragraphsCount: number;
      }> = [];
      let pendingBatch: Array<{ title: string; originalText: string }> = [];
      for await (const parsedChapter of lazyResult.chapterIterator) {
        pendingBatch.push({ title: parsedChapter.title, originalText: parsedChapter.content });
        if (pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE) {
          const rows = await flushImportBatch(importChaptersBatch, projectId, pendingBatch, token);
          importedRows.push(...rows);
          pendingBatch = [];
        }
      }
      if (pendingBatch.length > 0) {
        const rows = await flushImportBatch(importChaptersBatch, projectId, pendingBatch, token);
        importedRows.push(...rows);
      }
      await invalidateUserProjectCaches(req.user.id, projectId);

      if (importedRows.length === 0) {
        res.status(400).json({
          error: 'Файл не содержит глав',
          details: 'Не удалось извлечь ни одной главы из файла',
        });
        return;
      }
      if (lazyResult.errors.length > 0) {
        chapterCountWarnings.push(
          `Некоторые главы EPUB были пропущены из-за ошибок парсинга: ${lazyResult.errors.length}`
        );
      }

      if (importedRows.length === 1) {
        const fullChapter = await getChapter(
          requireRouteParam(req.params.id, 'id'),
          importedRows[0].chapterId,
          token
        );
        if (!fullChapter) {
          res.status(500).json({ error: 'Failed to load imported chapter' });
          return;
        }
        res.json(fullChapter);
      } else {
        res.json(buildMultiChapterImportResponse(importedRows, chapterCountWarnings));
      }
      return;
    }

    let parseResult: ParseResult;
    try {
      parseResult = await parseFile(req.file.buffer, filename);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'File parse error';
      req.log?.error({ err: parseError }, 'Parse error');
      res.status(400).json({
        error: 'Ошибка при парсинге файла',
        details: errorMessage,
        parseErrors: [errorMessage],
      });
      return;
    }

    if (parseResult.errors && parseResult.errors.length > 0) {
      req.log?.error({ parseErrors: parseResult.errors }, 'Parse errors');
      res.status(400).json({
        error: 'Ошибки при парсинге файла',
        details: parseResult.errors.join('; '),
        parseErrors: parseResult.errors,
        warnings: parseResult.warnings,
      });
      return;
    }

    const detectedType = getProjectTypeFromFormat(parseResult.format);
    const isFirstChapter = project.chapters.length === 0;
    const needsTypeUpdate = shouldUpdateProjectType(project.type, detectedType);

    if (isFirstChapter && needsTypeUpdate) {
      await updateProject(
        requireRouteParam(req.params.id, 'id'),
        { type: detectedType },
        req.user.id,
        token
      );
      req.log?.info(
        {
          event: 'project.type.detected',
          projectId: requireRouteParam(req.params.id, 'id'),
          type: detectedType,
        },
        `Project type set to ${detectedType}`
      );
    }

    const projectId = requireRouteParam(req.params.id, 'id');

    if (isFirstChapter) {
      const metadataUpdate = await resolveImportMetadataUpdate(
        project.metadata,
        parseResult.metadata,
        projectId,
        uploadFile,
        {
          buildCoverPath: buildImportCoverPath,
          onCoverError: (coverError) =>
            req.log?.error({ err: coverError }, 'Failed to save cover image'),
          onCoverSaved: (storagePath) =>
            req.log?.info({ event: 'cover.saved', storagePath }, 'Cover saved to Supabase Storage'),
        }
      );
      if (metadataUpdate) {
        await updateProject(projectId, { metadata: metadataUpdate }, req.user.id, token);
        req.log?.info(
          {
            event: 'project.metadata.updated',
            projectId,
            title: parseResult.metadata?.title,
          },
          'Project metadata updated'
        );
      }
    } else if (
      !isFirstChapter &&
      parseResult.metadata &&
      Object.keys(parseResult.metadata).length > 0
    ) {
      req.log?.debug(
        { projectId: requireRouteParam(req.params.id, 'id') },
        'Skipped metadata update: project already has chapters'
      );
    }

    if (parseResult.chapters.length === 0) {
      res.status(400).json({
        error: 'Файл не содержит глав',
        details: 'Не удалось извлечь ни одной главы из файла',
      });
      return;
    }

    const chapterCountWarnings = appendChapterCountWarning(
      [...(parseResult.warnings || [])],
      parseResult.chapters.length
    );

    const importedRows: Array<{
      sourceIndex: number;
      chapterId: string;
      number: number;
      title: string;
      paragraphsCount: number;
    }> = [];
    for (let i = 0; i < parseResult.chapters.length; i += IMPORT_CHAPTER_BATCH_SIZE) {
      const chunk = parseResult.chapters
        .slice(i, i + IMPORT_CHAPTER_BATCH_SIZE)
        .map((parsedChapter) => ({
          title: parsedChapter.title,
          originalText: parsedChapter.content,
        }));
      const rows = await flushImportBatch(importChaptersBatch, projectId, chunk, token);
      importedRows.push(...rows);
    }
    await invalidateUserProjectCaches(req.user.id, projectId);

    if (importedRows.length === 1) {
      const fullChapter = await getChapter(
        requireRouteParam(req.params.id, 'id'),
        importedRows[0].chapterId,
        token
      );
      if (!fullChapter) {
        res.status(500).json({ error: 'Failed to load imported chapter' });
        return;
      }
      res.json(fullChapter);
    } else {
      res.json(buildMultiChapterImportResponse(importedRows, chapterCountWarnings));
    }
  } catch (error) {
    if (handleServiceError(error, req, res)) return;
    const message = error instanceof Error ? error.message : 'Failed to add chapter';
    if (message.includes('Token is required') || message.includes('Invalid token')) {
      res.status(401).json({ error: message });
      return;
    }
    req.log?.error(
      { err: error, projectId: requireRouteParam(req.params.id, 'id') },
      'Failed to add chapter'
    );
    res.status(500).json({
      error: 'Failed to add chapter',
      details: message,
    });
  }
}
