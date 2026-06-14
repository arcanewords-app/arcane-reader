/**
 * Translate job runner - executed by BullMQ Worker.
 * Loads project/chapters from DB, runs performTranslation for each chapter.
 */

import {
  getChapter,
  updateChapter,
  getProjectFullForRecovery,
  resetStuckChaptersForRecovery,
} from '../supabaseDatabase.js';
import { releaseTokens } from '../../middleware/tokenLimits.js';
import { invalidateProjectAndRelatedCaches } from '../cacheInvalidation.js';
import { createTranslateJobStoreFromEnv } from '../translateJobStore.js';
import { mergeParagraphsToText } from '../../storage/database.js';
import { logger } from '../../logger.js';
import { createTraceId } from '../../debug/context.js';
import { loadConfig } from '../../config.js';
import type { Chapter } from '../../storage/database.js';
import type { TranslateJobPayload } from '../chapterQueue.js';
import {
  applyChapterTitleTranslations,
  collectTitleTranslationCandidates,
} from '../chapterTitleTranslate.js';
import type { TranslationStages } from '../../config/tokenLimits.js';

const translateJobStore = createTranslateJobStoreFromEnv();
const TRANSLATE_JOB_TTL_SECONDS = parseInt(process.env.TRANSLATE_JOB_TTL_SECONDS ?? '3600', 10);

export async function runTranslateJob(payload: TranslateJobPayload): Promise<void> {
  const {
    jobId,
    projectId,
    userId,
    estimatedTokens,
    chapterIds,
    stages,
    translateOnlyEmpty,
    translateChapterTitles,
    sourceLanguage,
    targetLanguage,
  } = payload;
  const translateTitles = translateChapterTitles !== false;
  const languagePair =
    sourceLanguage && targetLanguage ? { sourceLanguage, targetLanguage } : undefined;
  const token = ''; // Service role used for all DB ops

  try {
    const currentJob = await translateJobStore.getJob(jobId);
    if (!currentJob) return;
    await translateJobStore.updateJob(jobId, { status: 'processing' });

    const project = await getProjectFullForRecovery(projectId, userId, chapterIds);
    if (!project) {
      await translateJobStore.updateJob(jobId, {
        status: 'error',
        errors: ['Project or chapters no longer exist'],
        finishedAt: new Date().toISOString(),
      });
      await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      await translateJobStore.removeFromProjectIndex(projectId, jobId);
      await translateJobStore.clearUserActiveJob(userId, jobId);
      return;
    }

    await resetStuckChaptersForRecovery(projectId, chapterIds);

    const chaptersToTranslate: Array<Chapter & { originalText: string }> = [];
    for (const chapterId of chapterIds) {
      const chapter = project.chapters.find((c) => c.id === chapterId);
      if (!chapter) continue;
      const effectiveOriginalText =
        chapter.originalText && chapter.originalText.trim().length > 0
          ? chapter.originalText.trim()
          : chapter.paragraphs && chapter.paragraphs.length > 0
            ? mergeParagraphsToText(chapter.paragraphs, 'originalText').trim()
            : '';
      if (!effectiveOriginalText) continue;
      if (chapter.status === 'translating') continue;
      chaptersToTranslate.push({ ...chapter, originalText: effectiveOriginalText });
    }

    if (chaptersToTranslate.length === 0) {
      await translateJobStore.updateJob(jobId, {
        status: 'error',
        errors: ['No chapters with text to translate'],
        finishedAt: new Date().toISOString(),
      });
      await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      await translateJobStore.removeFromProjectIndex(projectId, jobId);
      await translateJobStore.clearUserActiveJob(userId, jobId);
      return;
    }

    const sortedChapters = [...chaptersToTranslate].sort(
      (a, b) => (a.number ?? 0) - (b.number ?? 0)
    );
    let totalTokensAccum = 0;
    let cancelledFlag = false;
    const succeededChapterIds = new Set<string>();
    const cancelCheckInterval = setInterval(async () => {
      if (await translateJobStore.isCancelRequested(jobId)) cancelledFlag = true;
    }, 500);

    const { performTranslation } = await import('../../server.js');

    try {
      for (let i = 0; i < sortedChapters.length; i++) {
        if (await translateJobStore.isCancelRequested(jobId)) break;

        const chapter = sortedChapters[i];
        const chapterStartTime = Date.now();

        const jobBeforeChapter = await translateJobStore.getJob(jobId);
        if (jobBeforeChapter) {
          await translateJobStore.updateJob(jobId, {
            current: i,
            currentChapterTitle: chapter.title,
            chapters: jobBeforeChapter.chapters.map((c) =>
              c.chapterId === chapter.id ? { ...c, status: 'processing' as const } : c
            ),
          });
        }

        await updateChapter(projectId, chapter.id, { status: 'translating' }, token, {
          useServiceRole: true,
        });
        await invalidateProjectAndRelatedCaches(userId, projectId, token, {
          useServiceRole: true,
        });

        try {
          await performTranslation(
            projectId,
            chapter.id,
            chapter,
            project,
            chapterStartTime,
            translateOnlyEmpty,
            token,
            userId,
            undefined,
            stages,
            {
              externalIsCancelled: () => cancelledFlag,
              traceId: createTraceId(),
              jobId,
              languagePair,
              translateChapterTitles: translateTitles,
              deferChapterTitleTranslation: true,
              onProgress: (chunksDone, totalChunks) => {
                translateJobStore
                  .updateJob(jobId, {
                    currentChapterChunksDone: chunksDone,
                    currentChapterTotalChunks: totalChunks,
                  })
                  .catch(() => {});
              },
            }
          );
        } catch (chErr) {
          const errMsg = chErr instanceof Error ? chErr.message : String(chErr);
          logger.error({ err: chErr }, `Translate batch chapter ${chapter.id} failed`);
          const jobNow = await translateJobStore.getJob(jobId);
          if (!jobNow) continue;
          const updatedChapters = jobNow.chapters.map((c) =>
            c.chapterId === chapter.id ? { ...c, status: 'error' as const } : c
          );
          await translateJobStore.updateJob(jobId, {
            chapters: updatedChapters,
            errors: [...jobNow.errors, `${chapter.title}: ${errMsg}`],
            currentChapterChunksDone: undefined,
            currentChapterTotalChunks: undefined,
          });
          continue;
        }

        const updatedChapter = await getChapter(projectId, chapter.id, token, {
          useServiceRole: true,
        });
        const hasBodyTranslation =
          updatedChapter &&
          (updatedChapter.status === 'completed' || updatedChapter.status === 'draft') &&
          (!!updatedChapter.translatedText?.trim() ||
            updatedChapter.paragraphs?.some((p) => p.translatedText?.trim()));
        if (hasBodyTranslation) {
          succeededChapterIds.add(chapter.id);
        }

        const meta = updatedChapter?.translationMeta;
        const tokensUsed = meta?.tokensUsed ?? 0;
        const tokensByStage = meta?.tokensByStage;
        const duration = meta?.duration ?? Date.now() - chapterStartTime;
        totalTokensAccum += tokensUsed;

        const jobNow = await translateJobStore.getJob(jobId);
        if (!jobNow) continue;
        const updatedChapters = jobNow.chapters.map((c) =>
          c.chapterId === chapter.id
            ? {
                ...c,
                status: 'completed' as const,
                tokensUsed,
                tokensByStage,
                duration,
              }
            : c
        );
        await translateJobStore.updateJob(jobId, {
          current: i + 1,
          chapters: updatedChapters,
          totalTokensUsed: totalTokensAccum,
          currentChapterTitle: undefined,
          currentChapterChunksDone: undefined,
          currentChapterTotalChunks: undefined,
        });
      }

      clearInterval(cancelCheckInterval);
      if (await translateJobStore.isCancelRequested(jobId)) {
        await translateJobStore.updateJob(jobId, {
          status: 'canceled',
          finishedAt: new Date().toISOString(),
        });
        await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
        try {
          await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
        } catch (tokenError) {
          logger.warn({ err: tokenError }, 'Failed to release tokens on cancel (non-critical)');
        }
        return;
      }

      if (translateTitles && succeededChapterIds.size > 0) {
        const stagesIncludeTranslation =
          stages === 'all' || (Array.isArray(stages) && stages.includes('translation'));
        if (stagesIncludeTranslation) {
          const chaptersForTitles = sortedChapters.filter((c) => succeededChapterIds.has(c.id));
          const refreshed = await Promise.all(
            chaptersForTitles.map((c) =>
              getChapter(projectId, c.id, token, { useServiceRole: true })
            )
          );
          const validChapters = refreshed.filter((c): c is Chapter => c != null);
          const candidates = collectTitleTranslationCandidates(validChapters, {
            translateChapterTitles: true,
            translateOnlyEmpty,
            stages: stages as TranslationStages,
            succeededChapterIds,
          });
          if (candidates.length > 0) {
            logger.info(
              { jobId, count: candidates.length },
              'Batch chapter title translation phase started'
            );
            await applyChapterTitleTranslations(loadConfig(), projectId, project, candidates, {
              userId,
              token,
              languagePair,
              isCancelled: () => cancelledFlag,
            });
          }
        }
      }

      await invalidateProjectAndRelatedCaches(userId, projectId, token, {
        useServiceRole: true,
      });
      await translateJobStore.updateJob(jobId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
      });
      await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
    } catch (bgErr) {
      clearInterval(cancelCheckInterval);
      const errMsg = bgErr instanceof Error ? bgErr.message : String(bgErr);
      logger.error({ err: bgErr }, `Translate batch job ${jobId} failed: ${errMsg}`);
      await translateJobStore.updateJob(jobId, {
        status: 'error',
        errors: [errMsg],
        finishedAt: new Date().toISOString(),
      });
      await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
      try {
        await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      } catch (tokenError) {
        logger.warn({ err: tokenError }, 'Failed to release tokens on error (non-critical)');
      }
    } finally {
      await translateJobStore.removeFromProjectIndex(projectId, jobId);
      await translateJobStore.clearUserActiveJob(userId, jobId);
    }
  } catch (outerErr) {
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    logger.error({ err: outerErr }, `Translate job ${jobId} failed: ${errMsg}`);
    await translateJobStore.updateJob(jobId, {
      status: 'error',
      errors: [errMsg],
      finishedAt: new Date().toISOString(),
    });
    await translateJobStore.setTtl(jobId, TRANSLATE_JOB_TTL_SECONDS);
    try {
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
    } catch {
      /* ignore */
    }
    await translateJobStore.removeFromProjectIndex(projectId, jobId);
    await translateJobStore.clearUserActiveJob(userId, jobId);
  }
}
