import type { Application } from 'express';
import type express from 'express';
import {
  chapterBulkIdsBodySchema,
  chapterIdsBodySchema,
  translateBatchBodySchema,
  chapterTranslateBodySchema,
  chapterCriticBodySchema,
  chapterTitleBodySchema,
  chapterNumberBodySchema,
  chapterStatusBodySchema,
  chaptersOrderBodySchema,
  paragraphUpdateBodySchema,
} from '../schemas/index.js';
import {
  getProject,
  duplicateChaptersInProject,
  bulkDeleteChapters,
  verifyChapterAccess,
  getChapterStatusRow,
  resetStuckChaptersForRecovery,
} from '../../services/supabase/domains/projects.js';
import {
  updateChapter,
  getChapter,
  deleteChapter,
  updateChapterNumber,
  updateChaptersOrder,
  markChaptersAsTranslatedBatch,
  type MarkTranslatedBatchResult,
} from '../../services/supabase/domains/chapters.js';
import { addGlossaryEntry, updateGlossaryEntry } from '../../services/supabase/domains/glossary.js';
import { updateParagraph } from '../../services/supabase/domains/paragraphs.js';
import { updateChapterStatus } from '../../services/supabase/domains/readerProgress.js';
import {
  getChapterStats,
  mergeParagraphsToText,
  type Chapter,
  type Paragraph,
} from '../../storage/database.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { handleServiceError } from '../../middleware/serviceHealth.js';
import { respondRouteError } from '../../middleware/routeDebugError.js';
import { resolveChapterStatusAfterTranslation } from '../../shared/chapterTranslationCoverage.js';

import { createTraceId, runWithDebugContextAsync } from '../../debug/context.js';
import { setDebugTraceId } from '../../debug/httpCaptureMiddleware.js';
import { requireToken } from '../../utils/requestHelpers.js';
import {
  checkTokenLimit,
  incrementTokenUsage,
  reserveTokens,
  releaseTokens,
} from '../../middleware/tokenLimits.js';
import {
  estimateProjectChapterTranslationTokens,
  estimateProjectBatchTranslationTokens,
  type TranslationStages,
} from '../../config/tokenLimits.js';
import { analyzeChaptersBatch, getStageModel } from '../../services/engine-integration.js';
import { requireRouteParam } from '../validateRoute.js';

import type { AnalysisJobState, AnalysisJobChapter } from '../../services/analysisJobStore.js';
import type { TranslateJobState, TranslateJobChapter } from '../../services/translateJobStore.js';
import {
  addAnalysisJob,
  addTranslateJob,
  getChapterTranslateQueue,
  isBullAvailable,
} from '../../services/chapterQueue.js';
import { invalidateProjectAndRelatedCaches } from '../../services/cacheInvalidation.js';
import {
  performTranslation,
  mergeGlossaryAppearanceForChapter,
  syncTranslationChunksToParagraphs,
  syncTranslationToParagraphs,
  logTranslationCoverageIfIncomplete,
} from '../chapterTranslation.js';
import {
  invalidateUserProjectCaches,
  generateAnalysisJobId,
  generateTranslateJobId,
  effectiveJobLanguageFields,
  warnLanguageOverrideWithGlossary,
  toPublicTranslateJob,
  toPublicAnalysisJob,
  translationCancelKey,
  translationCancelRegistry,
  getTranslationProgress,
  MARK_TRANSLATED_BATCH_CHUNK_SIZE,
  ANALYSIS_JOB_TTL_SECONDS,
  TRANSLATE_JOB_TTL_SECONDS,
  SERVER_START_TIME_MS,
} from '../routeHelpers.js';
import { parseTranslationStages } from '../chapters/helpers/translationStages.js';
import { resolveEffectiveOriginalText } from '../chapters/helpers/effectiveOriginalText.js';
import { buildTokenLimit429Response } from '../chapters/helpers/tokenLimitResponse.js';
import { isPreferAsync } from '../chapters/helpers/preferAsync.js';
import { validationFailedResponse } from '../chapters/helpers/validationResponse.js';
import { buildMarkTranslatedParagraphs } from '../chapters/helpers/markTranslated.js';
import { buildAnalysisChapterUpdate } from '../chapters/helpers/analysisUpdate.js';
import { setJobPollingNoStoreHeaders } from '../chapters/helpers/jobPolling.js';
import { computeTranslationTextLength } from '../chapters/helpers/paragraphTranslation.js';
import type { RouteDeps } from './deps.js';

export function registerChapterRoutes(app: Application, deps: RouteDeps): void {
  app.get(
    '/api/projects/:projectId/chapters/:chapterId/status',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }
        const token = requireToken(req);
        const statusRow = await getChapterStatusRow(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!statusRow) {
          return res.status(404).json({ error: 'Chapter not found' });
        }
        const { status, updated_at: updatedAt } = statusRow;

        // Orphan detection: chapter was translating before server restart (no progress in memory, updated_at before start)
        if (
          status === 'translating' &&
          !getTranslationProgress(
            requireRouteParam(req.params.projectId, 'projectId'),
            requireRouteParam(req.params.chapterId, 'chapterId')
          ) &&
          new Date(updatedAt).getTime() < SERVER_START_TIME_MS
        ) {
          await updateChapter(
            requireRouteParam(req.params.projectId, 'projectId'),
            requireRouteParam(req.params.chapterId, 'chapterId'),
            { status: 'pending' },
            token,
            { useServiceRole: true }
          );
          await invalidateProjectAndRelatedCaches(
            req.user.id,
            requireRouteParam(req.params.projectId, 'projectId'),
            token
          );
          return res.json({ status: 'pending' });
        }

        const payload: { status: string; chunksDone?: number; totalChunks?: number } = {
          status,
        };
        if (status === 'translating') {
          const progress = getTranslationProgress(
            requireRouteParam(req.params.projectId, 'projectId'),
            requireRouteParam(req.params.chapterId, 'chapterId')
          );
          if (progress) {
            payload.chunksDone = progress.chunksDone;
            payload.totalChunks = progress.totalChunks;
          }
        }
        res.json(payload);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get chapter status' });
      }
    }
  );

  app.get(
    '/api/projects/:projectId/chapters/:chapterId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const hasAccess = await verifyChapterAccess(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          req.user.id,
          token
        );
        if (!hasAccess) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }
        res.json(chapter);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get chapter' });
      }
    }
  );

  app.delete(
    '/api/projects/:projectId/chapters/:chapterId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const hasAccess = await verifyChapterAccess(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          req.user.id,
          token
        );
        if (!hasAccess) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        const success = await deleteChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!success) {
          return res.status(404).json({ error: 'Chapter not found' });
        }
        await invalidateUserProjectCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );
        res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        respondRouteError(req, res, error, {
          event: 'chapter.delete.failed',
          fallbackMessage: 'Failed to delete chapter',
          statusCode: 500,
        });
      }
    }
  );

  // Duplicate chapters within project (requires auth)
  app.post(
    '/api/projects/:projectId/chapters/duplicate',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsed = chapterBulkIdsBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const result = await duplicateChaptersInProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token,
          parsed.data.chapterIds
        );

        if (!result) {
          return res.status(404).json({ error: 'Project not found' });
        }

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json(result);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const coded = error as Error & { code?: string; expected?: number; actual?: number };
        if (coded.code === 'INVALID_CHAPTER_IDS') {
          return res.status(400).json({ error: coded.message, code: 'INVALID_CHAPTER_IDS' });
        }
        if (coded.code === 'TRANSFER_INCOMPLETE') {
          return res.status(500).json({
            error: coded.message,
            code: 'TRANSFER_INCOMPLETE',
            expected: coded.expected,
            actual: coded.actual,
          });
        }
        res.status(500).json({ error: 'Failed to duplicate chapters' });
      }
    }
  );

  // Bulk delete chapters (requires auth)
  app.post(
    '/api/projects/:projectId/chapters/bulk-delete',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsed = chapterBulkIdsBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const deleted = await bulkDeleteChapters(
          requireRouteParam(req.params.projectId, 'projectId'),
          parsed.data.chapterIds,
          token
        );

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        res.json({ deleted });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const coded = error as Error & { code?: string };
        if (coded.code === 'INVALID_CHAPTER_IDS') {
          return res.status(400).json({ error: coded.message, code: 'INVALID_CHAPTER_IDS' });
        }
        respondRouteError(req, res, error, {
          event: 'chapters.bulk_delete.failed',
          fallbackMessage: 'Failed to delete chapters',
          statusCode: 500,
        });
      }
    }
  );

  // Cancel translation (reset stuck status) (requires auth)
  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate/cancel',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          requireToken(req)
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        // Set cancel flag and immediately set chapter status to pending so UI updates without waiting for pipeline to exit
        if (chapter.status === 'translating') {
          translationCancelRegistry.set(
            translationCancelKey(
              requireRouteParam(req.params.projectId, 'projectId'),
              requireRouteParam(req.params.chapterId, 'chapterId')
            ),
            true
          );
          await updateChapter(
            requireRouteParam(req.params.projectId, 'projectId'),
            requireRouteParam(req.params.chapterId, 'chapterId'),
            { status: 'pending' },
            requireToken(req)
          );
          req.log?.info(
            {
              event: 'translation.cancelled',
              chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
              chapterTitle: chapter.title,
            },
            'Translation cancelled (flag set, status updated to pending)'
          );
          await invalidateProjectAndRelatedCaches(
            req.user.id,
            requireRouteParam(req.params.projectId, 'projectId'),
            requireToken(req)
          );
          res.json({ success: true, message: 'Translation cancelled' });
        } else {
          res.json({ success: false, message: 'Chapter is not being translated' });
        }
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to cancel translation');
        res.status(500).json({ error: 'Failed to cancel translation' });
      }
    }
  );

  // Manual sync translated chunks to paragraphs (recovery endpoint) (requires auth)
  // NOTE: Sync is now automatic after translation. This endpoint is for recovery only.
  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate/sync',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          requireToken(req)
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        // Check if translatedChunks exist
        if (!chapter.translatedChunks || chapter.translatedChunks.length === 0) {
          return res
            .status(400)
            .json({ error: 'No translated chunks found. Please translate the chapter first.' });
        }

        // Check if paragraphs exist
        if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
          return res.status(400).json({ error: 'No paragraphs found in chapter' });
        }

        req.log?.info(
          {
            event: 'translation.sync.manual',
            projectId: requireRouteParam(req.params.projectId, 'projectId'),
            chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
            chapterTitle: chapter.title,
            chunksCount: chapter.translatedChunks.length,
            paragraphsCount: chapter.paragraphs.length,
          },
          'Manual sync: translating chunks to paragraphs (recovery)'
        );

        // Determine if this is a partial translation (some paragraphs already have translations)
        const hasExistingTranslations = chapter.paragraphs.some(
          (p) => p.translatedText && p.translatedText.trim().length > 0
        );
        const partialTranslation = hasExistingTranslations;

        // Perform synchronization
        const syncedParagraphs = syncTranslationChunksToParagraphs(
          chapter.paragraphs,
          chapter.translatedChunks,
          partialTranslation
        );

        // Update chapter with synced paragraphs
        await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          {
            paragraphs: syncedParagraphs,
          },
          requireToken(req)
        );

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          requireToken(req)
        );
        res.json({
          success: true,
          message: 'Translation synchronized',
          syncedParagraphs: syncedParagraphs.filter(
            (p) => p.translatedText && p.translatedText.trim().length > 0
          ).length,
          totalParagraphs: chapter.paragraphs.length,
          recovered: true,
        });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        req.log?.error({ err: error }, 'Failed to sync translation');
        res.status(500).json({ error: `Failed to sync translation: ${errorMessage}` });
      }
    }
  );

  app.post(
    '/api/projects/:projectId/chapters/:chapterId/upload-translation',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        if (chapter.status === 'translating') {
          return res.status(400).json({
            error: 'Translation in progress',
            message: 'Дождитесь окончания перевода или отмените его.',
          });
        }

        if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
          return res.status(400).json({
            error: 'No paragraphs',
            message: 'Глава не содержит параграфов. Сначала добавьте главу с текстом.',
          });
        }

        const translatedText = (req.body?.translatedText ?? '').trim();
        if (!translatedText) {
          return res.status(400).json({
            error: 'Empty translation',
            message: 'Текст перевода не может быть пустым.',
          });
        }

        const syncedParagraphs = syncTranslationToParagraphs(chapter.paragraphs, translatedText, {
          replaceAll: true,
          editedBy: 'user',
        });

        const mergedText = mergeParagraphsToText(syncedParagraphs, 'translatedText');
        const chunks = mergedText
          .split(/\n\s*\n/)
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

        const now = new Date().toISOString();
        const uploadStatus = resolveChapterStatusAfterTranslation({
          paragraphs: syncedParagraphs,
          runEditing: false,
          editingPhase: 'none',
        });
        logTranslationCoverageIfIncomplete(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          syncedParagraphs
        );
        const updatedChapter = await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          {
            paragraphs: syncedParagraphs,
            translatedText: mergedText,
            translatedChunks: chunks,
            status: uploadStatus,
            translationMeta: {
              ...(chapter.translationMeta || {}),
              source: 'uploaded',
              translatedAt: now,
              tokensUsed: 0,
              duration: 0,
              model: 'uploaded',
            },
          },
          token
        );

        if (updatedChapter) {
          req.log?.info(
            {
              event: 'translation.uploaded',
              chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
              chapterTitle: chapter.title,
            },
            'Ready-made translation uploaded'
          );
          await invalidateProjectAndRelatedCaches(
            req.user.id,
            requireRouteParam(req.params.projectId, 'projectId'),
            token
          );
          res.json(updatedChapter);
        } else {
          res.status(500).json({ error: 'Failed to update chapter' });
        }
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        req.log?.error({ err: error }, 'Failed to upload translation');
        res.status(500).json({
          error: 'Failed to upload translation',
          details: errorMessage,
        });
      }
    }
  );

  // Mark chapter as translated (treat current content as ready-made translation)
  app.post(
    '/api/projects/:projectId/chapters/:chapterId/mark-as-translated',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        if (chapter.status === 'translating') {
          return res.status(400).json({
            error: 'Translation in progress',
            message: 'Дождитесь окончания перевода или отмените его.',
          });
        }

        if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
          return res.status(400).json({
            error: 'No paragraphs',
            message: 'Глава не содержит параграфов.',
          });
        }

        // Debug: input state
        const withOriginal = chapter.paragraphs.filter(
          (p) => (p.originalText || '').trim().length > 0
        ).length;
        const totalOriginalChars = chapter.paragraphs.reduce(
          (s, p) => s + (p.originalText || '').length,
          0
        );
        req.log?.debug(
          {
            chapterTitle: chapter.title,
            paragraphsCount: chapter.paragraphs.length,
            withOriginal,
            totalOriginalChars,
          },
          'mark-as-translated: input state'
        );

        const now = new Date().toISOString();
        const { updatedParagraphs, mergedText, chunks } = buildMarkTranslatedParagraphs(
          chapter.paragraphs,
          now
        );

        req.log?.debug(
          {
            chapterTitle: chapter.title,
            paragraphsCount: chapter.paragraphs.length,
            chunksCount: chunks.length,
            mergedLen: mergedText.length,
          },
          'mark-as-translated: counts'
        );

        const updatedChapter = await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          {
            paragraphs: updatedParagraphs,
            translatedText: mergedText,
            translatedChunks: chunks,
            originalText: '',
            status: 'completed',
            translationMeta: {
              ...(chapter.translationMeta || {}),
              source: 'uploaded',
              translatedAt: now,
              tokensUsed: 0,
              duration: 0,
              model: 'uploaded',
            },
          },
          token
        );

        if (updatedChapter) {
          req.log?.info(
            {
              event: 'chapter.marked_translated',
              chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
              chapterTitle: chapter.title,
            },
            'Chapter marked as translated'
          );
          await invalidateProjectAndRelatedCaches(
            req.user.id,
            requireRouteParam(req.params.projectId, 'projectId'),
            token
          );
          res.json(updatedChapter);
        } else {
          res.status(500).json({ error: 'Failed to update chapter' });
        }
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        req.log?.error({ err: error }, 'Failed to mark chapter as translated');
        res.status(500).json({
          error: 'Failed to mark chapter as translated',
          details: errorMessage,
        });
      }
    }
  );

  // Batch mark chapters as translated (single request, structured continue-and-report result)
  app.post(
    '/api/projects/:projectId/chapters/mark-as-translated-batch',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = chapterIdsBodySchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const chapterIds = Array.from(new Set(parsed.data.chapterIds));
        const continueOnError = parsed.data.options?.continueOnError ?? true;
        const aggregate: MarkTranslatedBatchResult = {
          summary: {
            total: chapterIds.length,
            processed: 0,
            success: 0,
            failed: 0,
            skipped: 0,
          },
          results: [],
        };
        for (let i = 0; i < chapterIds.length; i += MARK_TRANSLATED_BATCH_CHUNK_SIZE) {
          const chunk = chapterIds.slice(i, i + MARK_TRANSLATED_BATCH_CHUNK_SIZE);
          const chunkResult: MarkTranslatedBatchResult = await markChaptersAsTranslatedBatch(
            requireRouteParam(req.params.projectId, 'projectId'),
            chunk,
            token,
            { continueOnError }
          );
          aggregate.results.push(...chunkResult.results);
          aggregate.summary.processed += chunkResult.summary.processed;
          aggregate.summary.success += chunkResult.summary.success;
          aggregate.summary.failed += chunkResult.summary.failed;
          aggregate.summary.skipped += chunkResult.summary.skipped;
          // For strict mode, stop after first chunk with failed items to mimic fail-fast behavior.
          if (!continueOnError && chunkResult.summary.failed > 0) {
            break;
          }
        }

        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        req.log?.info(
          {
            event: 'chapters.mark_translated.batch_completed',
            projectId: requireRouteParam(req.params.projectId, 'projectId'),
            total: aggregate.summary.total,
            processed: aggregate.summary.processed,
            success: aggregate.summary.success,
            failed: aggregate.summary.failed,
            skipped: aggregate.summary.skipped,
          },
          'Batch mark-as-translated completed'
        );

        res.json(aggregate);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        req.log?.error({ err: error }, 'Failed to mark chapters as translated in batch');
        res.status(500).json({
          error: 'Failed to mark chapters as translated in batch',
          details: errorMessage,
        });
      }
    }
  );

  // Batch analysis endpoint (requires auth)
  app.post(
    '/api/projects/:projectId/chapters/analyze-batch',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const projectId = requireRouteParam(req.params.projectId, 'projectId');
        const project = await getProject(projectId, req.user.id, token);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = chapterIdsBodySchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { chapterIds, languagePair: languagePairOverride } = parsed.data;
        warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
        const jobLanguageFields = effectiveJobLanguageFields(project, languagePairOverride);

        const chaptersWithText: Array<Chapter & { originalText: string }> = [];

        for (const chapterId of chapterIds) {
          const chapter = await getChapter(projectId, chapterId, token);
          if (!chapter) continue;
          const effectiveOriginalText = resolveEffectiveOriginalText(chapter);
          if (!effectiveOriginalText) continue;
          chaptersWithText.push({ ...chapter, originalText: effectiveOriginalText });
        }

        if (chaptersWithText.length === 0) {
          return res.status(400).json({
            error: 'No chapters with text',
            message: 'None of the specified chapters have original text to analyze.',
          });
        }

        const estimatedTokens = estimateProjectBatchTranslationTokens(
          project,
          chaptersWithText.map((ch) => ({
            textLength: ch.originalText?.length ?? 0,
            chapterNumber: ch.number,
          })),
          { stages: ['analysis'], translateChapterTitles: false }
        );
        const limitCheck = await checkTokenLimit(
          req.user!.id,
          token,
          estimatedTokens,
          req.user!.role
        );
        if (!limitCheck.allowed) {
          return res.status(429).json(buildTokenLimit429Response(limitCheck, estimatedTokens));
        }

        const preferAsync = isPreferAsync(req);

        if (preferAsync) {
          const userId = req.user!.id;

          if (!isBullAvailable()) {
            return res.status(503).json({
              error: 'Job queue unavailable',
              message: 'REDIS_URL required for async jobs. Configure Redis and restart.',
            });
          }

          const hasActive = await deps.analysisJobStore.hasActiveJobForUser(userId);
          if (hasActive) {
            return res.status(409).json({
              error: 'Active job exists',
              message: 'У вас уже есть активная задача. Дождитесь её завершения.',
            });
          }

          await reserveTokens(userId, token, estimatedTokens);

          const jobId = generateAnalysisJobId();
          const jobChapters: AnalysisJobChapter[] = chaptersWithText.map((ch) => ({
            chapterId: ch.id,
            title: ch.title,
            status: 'pending' as const,
          }));
          const job: AnalysisJobState = {
            jobId,
            projectId,
            userId,
            status: 'queued',
            current: 0,
            total: chaptersWithText.length,
            chapters: jobChapters,
            totalTokensUsed: 0,
            errors: [],
            startedAt: new Date().toISOString(),
            finishedAt: null,
            cancelRequested: false,
            estimatedTokens,
            ...jobLanguageFields,
          };
          await deps.analysisJobStore.createJob(job);
          await deps.analysisJobStore.addToProjectIndex(projectId, jobId);
          await deps.analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
          await deps.analysisJobStore.setUserActiveJob(userId, jobId);

          await addAnalysisJob({
            jobId,
            projectId,
            userId,
            userRole: req.user.role,
            estimatedTokens,
            chapterIds: chaptersWithText.map((c) => c.id),
            ...jobLanguageFields,
          });

          req.log?.info(
            {
              event: 'analysis.job.enqueued',
              jobId,
              projectId,
              chapterCount: chaptersWithText.length,
            },
            'Analysis job enqueued'
          );

          res.status(202).json({ jobId, status: 'queued' as const });
          return;
        }

        const analysisConcurrency = Math.max(1, deps.config.translation?.analysisConcurrency ?? 4);
        const traceId = createTraceId();
        const requestId = (req as express.Request & { id: string }).id;
        setDebugTraceId(res, traceId);
        const result = await runWithDebugContextAsync({ traceId, requestId, projectId }, async () =>
          analyzeChaptersBatch(deps.config, project, chaptersWithText, {
            useCache: true,
            analysisConcurrency,
            languagePair: languagePairOverride,
            userRole: req.user!.role,
          })
        );

        if (result.glossaryUpdates.length > 0) {
          for (const entry of result.glossaryUpdates) {
            await addGlossaryEntry(projectId, entry, token, { useServiceRole: true });
          }
        }
        if (result.glossaryUpdatesExisting.length > 0) {
          for (const { id: entryId, updates } of result.glossaryUpdatesExisting) {
            await updateGlossaryEntry(projectId, entryId, updates, token, {
              useServiceRole: true,
            });
          }
        }

        for (const chResult of result.chapterResults) {
          if (!chResult.success) continue;
          const chapterNum =
            chaptersWithText.find((c) => c.id === chResult.chapterId)?.number ??
            chResult.chapterNumber;
          if (chResult.glossaryAppearanceEntryIds.length > 0) {
            await mergeGlossaryAppearanceForChapter(
              projectId,
              chResult.glossaryAppearanceEntryIds,
              chapterNum,
              token,
              { chapterId: chResult.chapterId }
            );
          }
          const nowIso = new Date().toISOString();
          const analysisModel =
            project.settings?.stageModels?.analysis ??
            project.settings?.model ??
            deps.config.openai.model;
          const existingChapter = await getChapter(projectId, chResult.chapterId, token, {
            useServiceRole: true,
          });
          const chapterUpdate = buildAnalysisChapterUpdate({
            existingChapter,
            chResult,
            totalDuration: result.totalDuration,
            analysisModel,
            nowIso,
          });
          await updateChapter(projectId, chResult.chapterId, chapterUpdate, token, {
            useServiceRole: true,
          });
        }

        try {
          await incrementTokenUsage(
            req.user.id,
            token,
            result.totalTokensUsed,
            {
              analysis: result.totalTokensUsed,
              translation: 0,
              editing: 0,
            },
            { useServiceRole: true }
          );
        } catch (tokenError) {
          req.log?.warn({ err: tokenError }, 'Failed to update token usage (non-critical)');
        }

        await invalidateProjectAndRelatedCaches(req.user.id, projectId, token, {
          useServiceRole: true,
        });

        res.json({
          success: true,
          totalChapters: result.chapterResults.length,
          successful: result.chapterResults.filter((c) => c.success).length,
          failed: result.chapterResults.filter((c) => !c.success).length,
          totalTokensUsed: result.totalTokensUsed,
          totalDuration: result.totalDuration,
          glossaryEntriesAdded: result.glossaryUpdates.length,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        req.log?.error({ err }, `Analyze batch failed: ${errorMessage}`);
        res.status(500).json({
          error: 'Analysis batch failed',
          details: errorMessage,
        });
      }
    }
  );

  // List all jobs for a project (analysis + translate)
  app.get('/api/projects/:projectId/jobs', requireAuth, requireRole('author'), async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const projectId = requireRouteParam(req.params.projectId, 'projectId');
    const project = await getProject(projectId, req.user.id, requireToken(req));
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [analysisJobs, translateJobs] = await Promise.all([
      deps.analysisJobStore.listByProject(projectId),
      deps.translateJobStore.listByProject(projectId),
    ]);

    const jobs = [
      ...analysisJobs
        .filter((j) => j.userId === req.user!.id)
        .map((j) => ({ type: 'analysis' as const, ...toPublicAnalysisJob(j, { compact: true }) })),
      ...translateJobs
        .filter((j) => j.userId === req.user!.id)
        .map((j) => ({
          type: 'translate' as const,
          ...toPublicTranslateJob(j, { compact: true }),
        })),
    ].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ jobs });
  });

  // Analysis job status (polling endpoint)
  app.get(
    '/api/projects/:projectId/analysis-jobs/:jobId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      const job = await deps.analysisJobStore.getJob(requireRouteParam(req.params.jobId, 'jobId'));
      if (!job) return res.status(404).json({ error: 'Analysis job not found' });
      if (
        job.userId !== req.user.id ||
        job.projectId !== requireRouteParam(req.params.projectId, 'projectId')
      ) {
        return res.status(404).json({ error: 'Analysis job not found' });
      }
      setJobPollingNoStoreHeaders(res);
      const compact = req.query.compact === '1' || req.query.compact === 'true';
      res.json(toPublicAnalysisJob(job, { compact }));
    }
  );

  // Cancel analysis job
  app.post(
    '/api/projects/:projectId/analysis-jobs/:jobId/cancel',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const job = await deps.analysisJobStore.getJob(
          requireRouteParam(req.params.jobId, 'jobId')
        );
        if (!job) return res.status(404).json({ error: 'Analysis job not found' });
        if (
          job.userId !== req.user.id ||
          job.projectId !== requireRouteParam(req.params.projectId, 'projectId')
        ) {
          return res.status(404).json({ error: 'Analysis job not found' });
        }
        if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
          return res.json({ success: true });
        }

        // Always perform store-side cleanup so user is unblocked immediately
        await deps.analysisJobStore.requestCancel(requireRouteParam(req.params.jobId, 'jobId'));
        await deps.analysisJobStore.updateJob(requireRouteParam(req.params.jobId, 'jobId'), {
          status: 'canceled',
          finishedAt: new Date().toISOString(),
        });
        await deps.analysisJobStore.setTtl(
          requireRouteParam(req.params.jobId, 'jobId'),
          ANALYSIS_JOB_TTL_SECONDS
        );
        try {
          await releaseTokens(job.userId, job.estimatedTokens ?? 0, { useServiceRole: true });
        } catch (tokenErr) {
          req.log?.warn({ err: tokenErr }, 'Failed to release tokens on cancel');
        }
        await deps.analysisJobStore.removeFromProjectIndex(
          job.projectId,
          requireRouteParam(req.params.jobId, 'jobId')
        );
        await deps.analysisJobStore.clearUserActiveJob(
          job.userId,
          requireRouteParam(req.params.jobId, 'jobId')
        );
        return res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Analysis job cancel failed');
        res.status(500).json({ error: 'Failed to cancel analysis job' });
      }
    }
  );

  // Batch translate endpoint (async job, like analyze-batch)
  app.post(
    '/api/projects/:projectId/chapters/translate-batch',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const projectId = requireRouteParam(req.params.projectId, 'projectId');
        const project = await getProject(projectId, req.user.id, token);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = translateBatchBodySchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const {
          chapterIds,
          translateOnlyEmpty,
          translateChapterTitles,
          stages: stagesRaw,
          languagePair: languagePairOverride,
        } = parsed.data;
        warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
        const jobLanguageFields = effectiveJobLanguageFields(project, languagePairOverride);
        const stages: TranslationStages = parseTranslationStages(stagesRaw);

        const chaptersToTranslate: Chapter[] = [];
        for (const chapterId of chapterIds) {
          const chapter = await getChapter(projectId, chapterId, token);
          if (!chapter) continue;
          const effectiveOriginalText = resolveEffectiveOriginalText(chapter);
          if (!effectiveOriginalText) continue;
          if (chapter.status === 'translating') continue;
          chaptersToTranslate.push({ ...chapter, originalText: effectiveOriginalText });
        }

        if (chaptersToTranslate.length === 0) {
          return res.status(400).json({
            error: 'No chapters to translate',
            message: 'None of the specified chapters have text or are already translating.',
          });
        }

        const translateTitles = translateChapterTitles !== false;
        const estimatedTokens = estimateProjectBatchTranslationTokens(
          project,
          chaptersToTranslate.map((ch) => ({
            textLength: ch.originalText?.length ?? 0,
            chapterNumber: ch.number,
          })),
          { stages, translateChapterTitles: translateTitles }
        );
        const limitCheck = await checkTokenLimit(
          req.user.id,
          token,
          estimatedTokens,
          req.user.role
        );
        if (!limitCheck.allowed) {
          return res.status(429).json(buildTokenLimit429Response(limitCheck, estimatedTokens));
        }

        const preferAsync = isPreferAsync(req);

        if (preferAsync) {
          const userId = req.user.id;

          if (!isBullAvailable()) {
            return res.status(503).json({
              error: 'Job queue unavailable',
              message: 'REDIS_URL required for async jobs. Configure Redis and restart.',
            });
          }

          const hasActive = await deps.translateJobStore.hasActiveJobForUser(userId);
          if (hasActive) {
            return res.status(409).json({
              error: 'Active job exists',
              message: 'У вас уже есть активная задача. Дождитесь её завершения.',
            });
          }

          await reserveTokens(userId, token, estimatedTokens);

          const jobId = generateTranslateJobId();
          const jobChapters: TranslateJobChapter[] = chaptersToTranslate.map((ch) => ({
            chapterId: ch.id,
            title: ch.title,
            status: 'pending' as const,
          }));
          const job: TranslateJobState = {
            jobId,
            projectId,
            userId,
            status: 'queued',
            current: 0,
            total: chaptersToTranslate.length,
            chapters: jobChapters,
            totalTokensUsed: 0,
            errors: [],
            startedAt: new Date().toISOString(),
            finishedAt: null,
            cancelRequested: false,
            estimatedTokens,
            ...jobLanguageFields,
          };
          await deps.translateJobStore.createJob(job);
          await deps.translateJobStore.addToProjectIndex(projectId, jobId);
          await deps.translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
          await deps.translateJobStore.setUserActiveJob(userId, jobId);

          await addTranslateJob({
            jobId,
            projectId,
            userId,
            userRole: req.user.role,
            estimatedTokens,
            chapterIds: chaptersToTranslate.map((c) => c.id),
            stages,
            translateOnlyEmpty: translateOnlyEmpty ?? false,
            translateChapterTitles: translateTitles,
            ...jobLanguageFields,
          });

          req.log?.info(
            {
              event: 'translate.job.enqueued',
              jobId,
              projectId,
              chapterCount: chaptersToTranslate.length,
            },
            'Translate job enqueued'
          );

          res.status(202).json({ jobId, status: 'queued' as const });
          return;
        }

        res.status(400).json({
          error: 'Async required',
          message: 'Use ?async=1 or Prefer: respond-async for batch translate.',
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        req.log?.error({ err }, `Translate batch failed: ${errorMessage}`);
        res.status(500).json({
          error: 'Translate batch failed',
          details: errorMessage,
        });
      }
    }
  );

  // Translate job status (polling endpoint)
  app.get(
    '/api/projects/:projectId/translate-jobs/:jobId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      const job = await deps.translateJobStore.getJob(requireRouteParam(req.params.jobId, 'jobId'));
      if (!job) return res.status(404).json({ error: 'Translate job not found' });
      if (
        job.userId !== req.user.id ||
        job.projectId !== requireRouteParam(req.params.projectId, 'projectId')
      ) {
        return res.status(404).json({ error: 'Translate job not found' });
      }
      setJobPollingNoStoreHeaders(res);
      const compact = req.query.compact === '1' || req.query.compact === 'true';
      res.json(toPublicTranslateJob(job, { compact }));
    }
  );

  // Cancel translate job
  app.post(
    '/api/projects/:projectId/translate-jobs/:jobId/cancel',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const job = await deps.translateJobStore.getJob(
          requireRouteParam(req.params.jobId, 'jobId')
        );
        if (!job) return res.status(404).json({ error: 'Translate job not found' });
        if (
          job.userId !== req.user.id ||
          job.projectId !== requireRouteParam(req.params.projectId, 'projectId')
        ) {
          return res.status(404).json({ error: 'Translate job not found' });
        }
        if (job.status === 'completed' || job.status === 'error' || job.status === 'canceled') {
          return res.json({ success: true });
        }

        // Always perform store-side cleanup so user is unblocked immediately.
        // If BullMQ job is orphan (no worker), also reset stuck chapters.
        let isOrphan = false;
        if (isBullAvailable()) {
          try {
            const queue = getChapterTranslateQueue();
            const bullJob = await queue.getJob(requireRouteParam(req.params.jobId, 'jobId'));
            isOrphan = !bullJob || !(await bullJob.isActive());
            if (isOrphan) {
              const chapterIds = job.chapters.map((c) => c.chapterId);
              await resetStuckChaptersForRecovery(job.projectId, chapterIds);
            }
          } catch (orphanErr) {
            req.log?.warn(
              { err: orphanErr, jobId: requireRouteParam(req.params.jobId, 'jobId') },
              'Orphan check failed, proceeding with cancel without chapter reset'
            );
          }
        }

        await deps.translateJobStore.requestCancel(requireRouteParam(req.params.jobId, 'jobId'));
        await deps.translateJobStore.updateJob(requireRouteParam(req.params.jobId, 'jobId'), {
          status: 'canceled',
          finishedAt: new Date().toISOString(),
        });
        await deps.translateJobStore.setTtl(
          requireRouteParam(req.params.jobId, 'jobId'),
          TRANSLATE_JOB_TTL_SECONDS
        );
        try {
          await releaseTokens(job.userId, job.estimatedTokens ?? 0, { useServiceRole: true });
        } catch (tokenErr) {
          req.log?.warn({ err: tokenErr }, 'Failed to release tokens on cancel');
        }
        await deps.translateJobStore.removeFromProjectIndex(
          job.projectId,
          requireRouteParam(req.params.jobId, 'jobId')
        );
        await deps.translateJobStore.clearUserActiveJob(
          job.userId,
          requireRouteParam(req.params.jobId, 'jobId')
        );
        return res.json({ success: true });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Translate job cancel failed');
        res.status(500).json({ error: 'Failed to cancel translate job' });
      }
    }
  );

  // Translation endpoint with logging (requires auth)
  app.post(
    '/api/projects/:projectId/chapters/:chapterId/translate',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        // Idempotency: only one translation job per chapter (refactor TRANSLATION_CANCEL_REFACTOR)
        if (chapter.status === 'translating') {
          return res.status(409).json({
            error: 'Translation already in progress',
            code: 'ALREADY_RUNNING',
            message: 'Перевод этой главы уже выполняется. Дождитесь завершения или отмените.',
          });
        }

        // Use chapter.originalText if set; otherwise derive from paragraphs (e.g. after "mark as translated" which clears chapter.originalText but keeps paragraph.originalText)
        const effectiveOriginalText = resolveEffectiveOriginalText(chapter);
        if (!effectiveOriginalText) {
          return res.status(400).json({
            error: 'No source text',
            message:
              'Глава не содержит исходного текста. Добавьте текст или импортируйте главу заново.',
          });
        }
        const chapterForTranslation = { ...chapter, originalText: effectiveOriginalText };

        const parsedBody = chapterTranslateBodySchema.safeParse(req.body || {});
        if (!parsedBody.success) {
          return res.status(400).json(validationFailedResponse(parsedBody.error));
        }
        const {
          translateOnlyEmpty = false,
          translateChapterTitles,
          paragraphIds,
          stages: stagesRaw,
          languagePair: languagePairOverride,
        } = parsedBody.data;
        warnLanguageOverrideWithGlossary(req, project, languagePairOverride);
        const stages: TranslationStages = parseTranslationStages(stagesRaw);

        const textLength = computeTranslationTextLength(
          chapterForTranslation.originalText.length,
          chapterForTranslation.paragraphs,
          { paragraphIds, translateOnlyEmpty }
        );

        const hasTranslatedText =
          !!chapterForTranslation.translatedText &&
          chapterForTranslation.translatedText.trim().length > 0;
        const hasTranslatedParagraphs = chapterForTranslation.paragraphs?.some(
          (p) => p.translatedText && p.translatedText.trim().length > 0
        );
        req.log?.debug(
          {
            chapterId: chapterForTranslation.id,
            chapterTitle: chapterForTranslation.title,
            status: chapterForTranslation.status,
            hasTranslatedText,
            hasTranslatedParagraphs,
            paragraphsCount: chapterForTranslation.paragraphs?.length ?? 0,
            mode: paragraphIds?.length
              ? `selected (${paragraphIds.length})`
              : translateOnlyEmpty
                ? 'empty only'
                : 'full',
          },
          'Chapter state before translation'
        );

        const startTime = Date.now();
        const wordCount = Math.max(1, textLength / 5);

        const analysisModel = getStageModel(
          project,
          'analysis',
          deps.config.openai.model,
          req.user!.role
        );
        const translationModel = getStageModel(
          project,
          'translation',
          deps.config.openai.model,
          req.user!.role
        );
        const editingModel = getStageModel(
          project,
          'editing',
          deps.config.openai.model,
          req.user!.role
        );

        const translateTitles = translateChapterTitles !== false;
        const estimatedTokens = estimateProjectChapterTranslationTokens(
          project,
          chapterForTranslation.number,
          { textLength, stages, translateChapterTitles: translateTitles }
        );

        // Check token limit before starting translation (limit depends on user role)
        const limitCheck = await checkTokenLimit(
          req.user.id,
          token,
          estimatedTokens,
          req.user.role
        );

        if (!limitCheck.allowed) {
          // Reset chapter status back to pending
          await updateChapter(
            requireRouteParam(req.params.projectId, 'projectId'),
            requireRouteParam(req.params.chapterId, 'chapterId'),
            { status: 'pending' },
            token
          );
          await invalidateProjectAndRelatedCaches(
            req.user.id,
            requireRouteParam(req.params.projectId, 'projectId'),
            token
          );

          return res.status(429).json(buildTokenLimit429Response(limitCheck, estimatedTokens));
        }

        // Update status to translating
        await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          { status: 'translating' },
          token
        );
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );

        const traceId = createTraceId();
        const requestId = (req as express.Request & { id: string }).id;
        setDebugTraceId(res, traceId);
        req.log?.info(
          {
            event: 'translation.started',
            traceId,
            requestId,
            projectId: requireRouteParam(req.params.projectId, 'projectId'),
            chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
            chapterTitle: chapterForTranslation.title,
            textLength,
            wordCount,
            hasApiKey: !!deps.config.openai.apiKey,
            analysisModel,
            translationModel,
            editingModel,
            temperature: project.settings?.temperature ?? deps.config.translation.temperature,
          },
          `Translation started: ${chapterForTranslation.title} (~${wordCount} words)`
        );

        performTranslation(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          chapterForTranslation,
          project,
          startTime,
          translateOnlyEmpty,
          token,
          req.user!.id,
          paragraphIds,
          stages,
          {
            traceId,
            requestId,
            languagePair: languagePairOverride,
            translateChapterTitles: translateTitles,
            userRole: req.user!.role,
          }
        );

        res.json({ status: 'started', chapterId: chapter.id, traceId });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to start translation' });
      }
    }
  );

  // Chapter translation review (Critic mode — Author+)
  app.post(
    '/api/projects/:projectId/chapters/:chapterId/critic',
    requireAuth,
    requireRole('author_plus'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = requireToken(req);
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          token
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          token
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        if (chapter.status === 'translating') {
          return res.status(409).json({
            error: 'Translation in progress',
            code: 'ALREADY_TRANSLATING',
            message: 'Дождитесь завершения перевода перед проверкой.',
          });
        }

        const parsedBody = chapterCriticBodySchema.safeParse(req.body || {});
        if (!parsedBody.success) {
          return res.status(400).json(validationFailedResponse(parsedBody.error));
        }

        const { force = false } = parsedBody.data;
        const fingerprint = (
          await import('../../services/chapter-critic.js')
        ).computeCriticContentFingerprint(chapter.paragraphs ?? []);

        if (
          !force &&
          chapter.criticReport &&
          chapter.criticReport.contentFingerprint === fingerprint
        ) {
          return res.json({ report: chapter.criticReport, cached: true });
        }

        const {
          runChapterCritic,
          computeCriticInputStats,
          CriticInputTooLargeError,
          CriticChapterTooLongError,
          CriticNoTranslationError,
          CriticOutputTruncatedError,
        } = await import('../../services/chapter-critic.js');
        const { GlossaryManager } = await import('../../engine/index.js');
        const { languageDisplayName } = await import('../../engine/language.js');
        const { getAgentForProject } = await import('../../services/engine-integration.js');

        const agent = await getAgentForProject(project);
        const glossaryText = new GlossaryManager(agent.glossary).toPromptText({
          targetLanguageLabel: languageDisplayName(
            project.targetLanguage as import('../../engine/types/common.js').Language
          ),
        });
        const stats = computeCriticInputStats(chapter, glossaryText);

        if (stats.tooLarge) {
          return res.status(400).json({
            error: 'Chapter too long for review',
            code: 'CRITIC_INPUT_TOO_LARGE',
            totalChars: stats.totalChars,
            maxChars: stats.maxInputChars,
          });
        }

        const estimatedTokens = Math.ceil(stats.totalChars / 3) + 2000;
        const limitCheck = await checkTokenLimit(
          req.user.id,
          token,
          estimatedTokens,
          req.user.role
        );
        if (!limitCheck.allowed) {
          return res.status(429).json(buildTokenLimit429Response(limitCheck, estimatedTokens));
        }

        let report;
        try {
          report = await runChapterCritic(project, chapter);
        } catch (err) {
          if (err instanceof CriticInputTooLargeError) {
            return res.status(400).json({
              error: 'Chapter too long for review',
              code: 'CRITIC_INPUT_TOO_LARGE',
              totalChars: err.totalChars,
              maxChars: err.maxChars,
            });
          }
          if (err instanceof CriticChapterTooLongError) {
            return res.status(400).json({
              error: err.message,
              code: 'CRITIC_CHAPTER_TOO_LONG',
            });
          }
          if (err instanceof CriticNoTranslationError) {
            return res.status(400).json({
              error: err.message,
              code: 'CRITIC_NO_TRANSLATION',
            });
          }
          if (err instanceof CriticOutputTruncatedError) {
            return res.status(422).json({
              error: 'Review output was truncated',
              code: 'CRITIC_OUTPUT_TRUNCATED',
              message: 'Ответ модели обрезан. Попробуйте проверить снова.',
            });
          }
          throw err;
        }

        await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          { criticReport: report },
          token
        );
        await invalidateProjectAndRelatedCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId'),
          token
        );
        await incrementTokenUsage(req.user.id, token, report.tokensUsed);

        res.json({ report, cached: false });
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Chapter critic failed');
        res.status(500).json({ error: 'Failed to run translation review' });
      }
    }
  );
  app.get(
    '/api/projects/:projectId/chapters/:chapterId/stats',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const chapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          requireToken(req)
        );
        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        const stats = getChapterStats(chapter);
        res.json(stats);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to get chapter stats' });
      }
    }
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/title',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = chapterTitleBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { title } = parsed.data;

        const existingChapter = await getChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          requireToken(req)
        );
        if (!existingChapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        const trimmed = title.trim();
        const hasTranslation =
          existingChapter.status === 'completed' ||
          existingChapter.status === 'draft' ||
          !!existingChapter.translatedText?.trim() ||
          existingChapter.paragraphs?.some((p) => p.translatedText?.trim());

        const chapter = await updateChapter(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          hasTranslation ? { translatedTitle: trimmed } : { title: trimmed },
          requireToken(req)
        );

        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        req.log?.info(
          {
            event: 'chapter.title.updated',
            chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
            title: chapter.title,
          },
          `Chapter title updated: "${chapter.title}"`
        );
        await invalidateUserProjectCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );
        res.json(chapter);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update chapter title');
        res.status(500).json({ error: 'Failed to update chapter title' });
      }
    }
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/number',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsed = chapterNumberBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { number } = parsed.data;

        const chapter = await updateChapterNumber(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          number,
          requireToken(req)
        );

        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        req.log?.info(
          {
            event: 'chapter.number.updated',
            chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
            chapterTitle: chapter.title,
            number,
          },
          `Chapter number updated: "${chapter.title}" → ${number}`
        );
        await invalidateUserProjectCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );

        // Return updated project with reordered chapters
        // No delay needed - Supabase updates are synchronous within the same connection
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        res.json(project);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update chapter number');
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update chapter number';
        res.status(500).json({ error: errorMessage });
      }
    }
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/status',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify project belongs to user
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const parsed = chapterStatusBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { status } = parsed.data;

        const chapter = await updateChapterStatus(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          status,
          requireToken(req)
        );

        if (!chapter) {
          return res.status(404).json({ error: 'Chapter not found' });
        }

        req.log?.info(
          {
            event: 'chapter.status.updated',
            chapterId: requireRouteParam(req.params.chapterId, 'chapterId'),
            chapterTitle: chapter.title,
            status,
          },
          `Chapter status updated: "${chapter.title}" → ${status}`
        );
        await invalidateUserProjectCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );

        res.json(chapter);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to update chapter status');
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to update chapter status';
        res.status(500).json({ error: errorMessage });
      }
    }
  );

  // Reorder chapters (accepts full ordered ids array)
  app.put(
    '/api/projects/:projectId/chapters/order',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const parsed = chaptersOrderBodySchema.safeParse(req.body || {});
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { ids } = parsed.data;

        await updateChaptersOrder(
          requireRouteParam(req.params.projectId, 'projectId'),
          ids,
          requireToken(req)
        );
        await invalidateUserProjectCaches(
          req.user.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );

        // Return updated project
        const project = await getProject(
          requireRouteParam(req.params.projectId, 'projectId'),
          req.user.id,
          requireToken(req)
        );
        res.json(project);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        req.log?.error({ err: error }, 'Failed to reorder chapters');
        const message = error instanceof Error ? error.message : 'Failed to reorder chapters';
        res.status(500).json({ error: message });
      }
    }
  );

  app.put(
    '/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId',
    requireAuth,
    requireRole('author'),
    async (req, res) => {
      try {
        const parsed = paragraphUpdateBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json(validationFailedResponse(parsed.error));
        }
        const { translatedText, status } = parsed.data;

        const updates: Partial<Paragraph> = {};
        if (translatedText !== undefined) {
          updates.translatedText = translatedText;
          updates.editedAt = new Date().toISOString();
          updates.editedBy = 'user';
        }
        if (status !== undefined) {
          updates.status = status;
        }

        const token = requireToken(req);
        const paragraph = await updateParagraph(
          requireRouteParam(req.params.projectId, 'projectId'),
          requireRouteParam(req.params.chapterId, 'chapterId'),
          requireRouteParam(req.params.paragraphId, 'paragraphId'),
          updates,
          token
        );

        if (!paragraph) {
          return res.status(404).json({ error: 'Paragraph not found' });
        }

        req.log?.debug(
          { paragraphId: paragraph.id.slice(0, 8), status: paragraph.status },
          'Paragraph updated'
        );
        await invalidateUserProjectCaches(
          req.user!.id,
          requireRouteParam(req.params.projectId, 'projectId')
        );
        res.json(paragraph);
      } catch (error) {
        if (handleServiceError(error, req, res)) return;
        res.status(500).json({ error: 'Failed to update paragraph' });
      }
    }
  );
}
