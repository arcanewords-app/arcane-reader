/**
 * Background async import job runner — extracted from chapter import routes.
 */

import type { ProjectType } from '../../../storage/database.js';
import {
  getProjectTypeFromFormat,
  parseEpubLazy,
  parseFile,
} from '../../../services/import/index.js';
import { importChaptersBatch } from '../../../services/supabase/domains/chapters.js';
import { updateProject } from '../../../services/supabase/domains/projects.js';
import { uploadFile } from '../../../services/storage.js';
import { invalidateProjectAndRelatedCaches } from '../../../services/cacheInvalidation.js';
import type { ImportJobStore } from '../../../services/importJobStore.js';
import {
  IMPORT_CHAPTER_BATCH_SIZE,
  IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT,
  IMPORT_JOB_PROGRESS_UPDATE_EVERY,
  IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS,
  IMPORT_JOB_TTL_SECONDS,
} from '../../routeHelpers.js';
import {
  appendChapterCountWarning,
  appendRecentChapterSnapshot,
  buildRecentChapterSnapshotEntries,
  flushImportBatch,
  resolveImportMetadataUpdate,
  shouldUpdateProjectType,
} from './importPipeline.js';
import { buildImportCoverPath } from './importCoverPath.js';

export interface AsyncImportJobLog {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface AsyncImportJobParams {
  jobId: string;
  projectId: string;
  userId: string;
  token: string;
  buffer: Buffer;
  filename: string;
  extension: 'epub' | 'fb2' | 'csv';
  project: {
    metadata?: object;
    type?: ProjectType;
    chapters: { length: number };
  };
  importJobStore: ImportJobStore;
  log?: AsyncImportJobLog;
}

export async function runAsyncImportJob(params: AsyncImportJobParams): Promise<void> {
  const {
    jobId,
    projectId,
    userId,
    token,
    buffer,
    filename,
    extension,
    project,
    importJobStore,
    log,
  } = params;

  const jobStartedAtMs = Date.now();
  const currentJob = await importJobStore.getJob(jobId);
  if (!currentJob) return;

  log?.info(
    {
      event: 'import.job.started',
      jobId,
      projectId,
      userId,
      format: extension,
      filename,
      fileSizeBytes: buffer.length,
    },
    'Import job started'
  );
  await importJobStore.updateJob(jobId, {
    status: 'processing',
    phase: 'parsing',
  });

  try {
    const isFirstChapter = project.chapters.length === 0;

    if (extension === 'epub') {
      const epubParseStartedAtMs = Date.now();
      log?.info({ event: 'import.job.epub.parsing.started', jobId }, 'EPUB parsing started');
      const lazyResult = await parseEpubLazy(buffer);
      log?.info(
        {
          event: 'import.job.epub.parsing.finished',
          jobId,
          durationMs: Date.now() - epubParseStartedAtMs,
          chapterCount: lazyResult.chapterCount,
          warningsCount: lazyResult.warnings.length,
          initialErrorsCount: lazyResult.errors.length,
        },
        'EPUB parsing finished'
      );
      if (lazyResult.errors.length > 0) {
        await importJobStore.updateJob(jobId, {
          status: 'error',
          errors: [...lazyResult.errors],
          finishedAt: new Date().toISOString(),
        });
        await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
        return;
      }
      if (lazyResult.chapterCount === 0) {
        await importJobStore.updateJob(jobId, {
          status: 'error',
          errors: ['Файл не содержит глав'],
          finishedAt: new Date().toISOString(),
        });
        await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
        return;
      }

      const epubWarnings = appendChapterCountWarning(
        [...lazyResult.warnings],
        lazyResult.chapterCount
      );

      await importJobStore.updateJob(jobId, {
        total: lazyResult.chapterCount,
        warnings: epubWarnings,
      });

      const detectedType = getProjectTypeFromFormat('epub');
      const needsTypeUpdate = shouldUpdateProjectType(project.type, detectedType);
      if (isFirstChapter && needsTypeUpdate) {
        await updateProject(projectId, { type: detectedType }, userId, token, {
          useServiceRole: true,
        });
      }

      if (isFirstChapter) {
        const metadataUpdate = await resolveImportMetadataUpdate(
          project.metadata,
          lazyResult.metadata,
          projectId,
          uploadFile,
          {
            buildCoverPath: buildImportCoverPath,
            onCoverError: (coverError) =>
              log?.error({ err: coverError, jobId }, 'Failed to save cover image'),
          }
        );
        if (metadataUpdate) {
          await updateProject(projectId, { metadata: metadataUpdate }, userId, token, {
            useServiceRole: true,
          });
        }
      }

      await importJobStore.updateJob(jobId, { phase: 'saving' });
      log?.info(
        {
          event: 'import.job.epub.saving.started',
          jobId,
          totalChapters: lazyResult.chapterCount,
        },
        'EPUB saving started'
      );
      let chapterNumber = 0;
      let lastProgressUpdateAtMs = 0;
      let recentChapters: Array<{ number: number; title: string }> = [];
      let pendingBatch: Array<{ title: string; originalText: string }> = [];
      let pendingBatchTitles: string[] = [];
      for await (const parsedChapter of lazyResult.chapterIterator) {
        if (await importJobStore.isCancelRequested(jobId)) {
          await importJobStore.updateJob(jobId, {
            status: 'canceled',
            finishedAt: new Date().toISOString(),
          });
          await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
          return;
        }

        chapterNumber++;
        pendingBatch.push({
          title: parsedChapter.title,
          originalText: parsedChapter.content,
        });
        pendingBatchTitles.push(parsedChapter.title);
        const shouldFlushBatch = pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE;

        if (shouldFlushBatch) {
          await flushImportBatch(importChaptersBatch, projectId, pendingBatch, token, {
            useServiceRole: true,
          });
          const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
          recentChapters = appendRecentChapterSnapshot(
            recentChapters,
            buildRecentChapterSnapshotEntries(firstBatchChapterNumber, pendingBatchTitles),
            IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
          );
          pendingBatch = [];
          pendingBatchTitles = [];
        }

        const nowMs = Date.now();
        const shouldFlushProgress =
          chapterNumber === 1 ||
          chapterNumber === lazyResult.chapterCount ||
          chapterNumber % IMPORT_JOB_PROGRESS_UPDATE_EVERY === 0 ||
          nowMs - lastProgressUpdateAtMs >= IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS;

        if (shouldFlushProgress) {
          await importJobStore.updateJob(jobId, {
            currentChapterTitle: parsedChapter.title,
            current: chapterNumber,
            chapters: recentChapters,
          });
          lastProgressUpdateAtMs = nowMs;
        }

        if (
          chapterNumber === 1 ||
          chapterNumber % 25 === 0 ||
          chapterNumber === lazyResult.chapterCount
        ) {
          log?.info(
            {
              event: 'import.job.epub.saving.progress',
              jobId,
              current: chapterNumber,
              total: lazyResult.chapterCount,
              currentChapterTitle: parsedChapter.title,
            },
            'EPUB saving progress'
          );
        }
      }
      if (pendingBatch.length > 0) {
        await flushImportBatch(importChaptersBatch, projectId, pendingBatch, token, {
          useServiceRole: true,
        });
        const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
        recentChapters = appendRecentChapterSnapshot(
          recentChapters,
          buildRecentChapterSnapshotEntries(firstBatchChapterNumber, pendingBatchTitles),
          IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
        );
        pendingBatch = [];
        pendingBatchTitles = [];
      }

      if (chapterNumber === 0) {
        await importJobStore.updateJob(jobId, {
          status: 'error',
          errors:
            lazyResult.errors.length > 0
              ? [...lazyResult.errors]
              : ['Не удалось извлечь ни одной главы из EPUB файла'],
          finishedAt: new Date().toISOString(),
        });
        await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
        log?.warn(
          {
            event: 'import.job.epub.saving.empty',
            jobId,
            parserErrors: lazyResult.errors.length,
          },
          'EPUB finished with zero saved chapters'
        );
        return;
      }

      if (lazyResult.errors.length > 0) {
        const mergedWarnings = [
          ...epubWarnings,
          `Некоторые главы EPUB были пропущены из-за ошибок парсинга: ${lazyResult.errors.length}`,
        ];
        await importJobStore.updateJob(jobId, {
          warnings: mergedWarnings,
          errors: [...lazyResult.errors],
        });
        log?.warn(
          {
            event: 'import.job.epub.saving.partial-errors',
            jobId,
            parserErrors: lazyResult.errors.length,
            savedChapters: chapterNumber,
          },
          'EPUB imported with chapter parse errors'
        );
      }
    } else {
      const parseResult = await parseFile(buffer, filename);
      if (parseResult.errors && parseResult.errors.length > 0) {
        await importJobStore.updateJob(jobId, {
          status: 'error',
          errors: [...parseResult.errors],
          finishedAt: new Date().toISOString(),
        });
        await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
        return;
      }
      if (parseResult.chapters.length === 0) {
        await importJobStore.updateJob(jobId, {
          status: 'error',
          errors: ['Файл не содержит глав'],
          finishedAt: new Date().toISOString(),
        });
        await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
        return;
      }

      const parseWarnings = appendChapterCountWarning(
        [...(parseResult.warnings || [])],
        parseResult.chapters.length
      );

      await importJobStore.updateJob(jobId, {
        total: parseResult.chapters.length,
        warnings: parseWarnings,
      });

      const detectedType = getProjectTypeFromFormat(parseResult.format);
      const needsTypeUpdate = shouldUpdateProjectType(project.type, detectedType);
      if (isFirstChapter && needsTypeUpdate) {
        await updateProject(projectId, { type: detectedType }, userId, token, {
          useServiceRole: true,
        });
      }

      if (isFirstChapter) {
        const metadataUpdate = await resolveImportMetadataUpdate(
          project.metadata,
          parseResult.metadata,
          projectId,
          uploadFile,
          {
            buildCoverPath: buildImportCoverPath,
            onCoverError: (coverError) =>
              log?.error({ err: coverError, jobId }, 'Failed to save cover image'),
          }
        );
        if (metadataUpdate) {
          await updateProject(projectId, { metadata: metadataUpdate }, userId, token, {
            useServiceRole: true,
          });
        }
      }

      await importJobStore.updateJob(jobId, { phase: 'saving' });
      let lastProgressUpdateAtMs = 0;
      let recentChapters: Array<{ number: number; title: string }> = [];
      let pendingBatch: Array<{ title: string; originalText: string }> = [];
      let pendingBatchTitles: string[] = [];
      for (const [idx, parsedChapter] of parseResult.chapters.entries()) {
        if (await importJobStore.isCancelRequested(jobId)) {
          await importJobStore.updateJob(jobId, {
            status: 'canceled',
            finishedAt: new Date().toISOString(),
          });
          await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
          return;
        }

        const chapterNumber = idx + 1;
        pendingBatch.push({
          title: parsedChapter.title,
          originalText: parsedChapter.content,
        });
        pendingBatchTitles.push(parsedChapter.title);
        const shouldFlushBatch =
          pendingBatch.length >= IMPORT_CHAPTER_BATCH_SIZE ||
          chapterNumber === parseResult.chapters.length;

        if (shouldFlushBatch) {
          await flushImportBatch(importChaptersBatch, projectId, pendingBatch, token, {
            useServiceRole: true,
          });
          const firstBatchChapterNumber = chapterNumber - pendingBatchTitles.length + 1;
          recentChapters = appendRecentChapterSnapshot(
            recentChapters,
            buildRecentChapterSnapshotEntries(firstBatchChapterNumber, pendingBatchTitles),
            IMPORT_JOB_MAX_CHAPTERS_SNAPSHOT
          );
          pendingBatch = [];
          pendingBatchTitles = [];
        }

        const nowMs = Date.now();
        const shouldFlushProgress =
          chapterNumber === 1 ||
          chapterNumber === parseResult.chapters.length ||
          chapterNumber % IMPORT_JOB_PROGRESS_UPDATE_EVERY === 0 ||
          nowMs - lastProgressUpdateAtMs >= IMPORT_JOB_PROGRESS_UPDATE_MAX_STALENESS_MS;

        if (shouldFlushProgress) {
          await importJobStore.updateJob(jobId, {
            currentChapterTitle: parsedChapter.title,
            current: chapterNumber,
            chapters: recentChapters,
          });
          lastProgressUpdateAtMs = nowMs;
        }
      }
    }

    try {
      await invalidateProjectAndRelatedCaches(userId, projectId, token, {
        useServiceRole: true,
      });
    } catch (cacheError) {
      log?.warn(
        { err: cacheError, jobId, projectId },
        'Import completed but cache invalidation failed'
      );
    }

    await importJobStore.updateJob(jobId, {
      phase: 'finalizing',
      status: 'completed',
      finishedAt: new Date().toISOString(),
    });
    await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
    log?.info(
      {
        event: 'import.job.completed',
        jobId,
        format: extension,
        durationMs: Date.now() - jobStartedAtMs,
      },
      'Import job completed'
    );
  } catch (err) {
    await importJobStore.updateJob(jobId, {
      status: 'error',
      errors: [err instanceof Error ? err.message : 'Import failed'],
      finishedAt: new Date().toISOString(),
    });
    await importJobStore.setTtl(jobId, IMPORT_JOB_TTL_SECONDS);
    log?.error(
      {
        err,
        jobId,
        format: extension,
        durationMs: Date.now() - jobStartedAtMs,
      },
      'Import job failed'
    );
  }
}
