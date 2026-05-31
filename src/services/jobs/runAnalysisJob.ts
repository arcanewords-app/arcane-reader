/**
 * Analysis job runner - executed by BullMQ Worker.
 * Loads project/chapters from DB, runs analyzeChaptersBatch, updates job state.
 */

import { loadConfig } from '../../config.js';
import { analyzeChaptersBatch } from '../engine-integration.js';
import {
  getChapter,
  updateChapter,
  addGlossaryEntry,
  updateGlossaryEntry,
  getGlossaryEntry,
  getProjectFullForRecovery,
} from '../supabaseDatabase.js';
import { releaseTokens } from '../../middleware/tokenLimits.js';
import { invalidateProjectAndRelatedCaches } from '../cacheInvalidation.js';
import { createAnalysisJobStoreFromEnv } from '../analysisJobStore.js';
import { mergeParagraphsToText } from '../../storage/database.js';
import { logger } from '../../logger.js';
import { runWithDebugContextAsync, createTraceId } from '../../debug/context.js';
import type { Chapter } from '../../storage/database.js';
import type { AnalysisJobPayload } from '../chapterQueue.js';
import type { AnalysisJobChapter } from '../analysisJobStore.js';

const analysisJobStore = createAnalysisJobStoreFromEnv();
const ANALYSIS_JOB_TTL_SECONDS = parseInt(process.env.ANALYSIS_JOB_TTL_SECONDS ?? '3600', 10);

export async function runAnalysisJob(payload: AnalysisJobPayload): Promise<void> {
  const { jobId, projectId, userId, estimatedTokens, chapterIds } = payload;
  const config = loadConfig();
  const token = ''; // Service role used for all DB ops

  try {
    const currentJob = await analysisJobStore.getJob(jobId);
    if (!currentJob) return;
    await analysisJobStore.updateJob(jobId, { status: 'processing' });

    const project = await getProjectFullForRecovery(projectId, userId, chapterIds);
    if (!project) {
      await analysisJobStore.updateJob(jobId, {
        status: 'error',
        errors: ['Project or chapters no longer exist'],
        finishedAt: new Date().toISOString(),
      });
      await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      await analysisJobStore.removeFromProjectIndex(projectId, jobId);
      await analysisJobStore.clearUserActiveJob(userId, jobId);
      return;
    }

    const chaptersWithText: Array<Chapter & { originalText: string }> = [];
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
      chaptersWithText.push({ ...chapter, originalText: effectiveOriginalText });
    }

    if (chaptersWithText.length === 0) {
      await analysisJobStore.updateJob(jobId, {
        status: 'error',
        errors: ['No chapters with text to analyze'],
        finishedAt: new Date().toISOString(),
      });
      await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      await analysisJobStore.removeFromProjectIndex(projectId, jobId);
      await analysisJobStore.clearUserActiveJob(userId, jobId);
      return;
    }

    const chapterMap = new Map(chaptersWithText.map((c) => [c.id, c]));
    let totalTokensAccum = 0;
    let cancelledFlag = false;
    const cancelCheckInterval = setInterval(async () => {
      if (await analysisJobStore.isCancelRequested(jobId)) cancelledFlag = true;
    }, 500);

    try {
      const analysisConcurrency = Math.max(1, config.translation?.analysisConcurrency ?? 4);
      const result = await runWithDebugContextAsync(
        { traceId: createTraceId(), jobId, projectId },
        async () =>
          analyzeChaptersBatch(config, project, chaptersWithText, {
            useCache: true,
            analysisConcurrency,
            isCancelled: () => cancelledFlag,
            onProgress: async (chapterId, progResult) => {
              if (await analysisJobStore.isCancelRequested(jobId)) return;
              const ch = chapterMap.get(chapterId);
              if (!ch) return;
              totalTokensAccum += progResult.tokensUsed;
              const status: AnalysisJobChapter['status'] = progResult.success
                ? 'completed'
                : 'error';
              const jobNow = await analysisJobStore.getJob(jobId);
              if (!jobNow) return;
              const updatedChapters = jobNow.chapters.map((c) =>
                c.chapterId === chapterId ? { ...c, status, tokensUsed: progResult.tokensUsed } : c
              );
              const completedCount = updatedChapters.filter((c) => c.status === 'completed').length;
              const errorCount = updatedChapters.filter((c) => c.status === 'error').length;

              if (progResult.success) {
                const nowIso = new Date().toISOString();
                const analysisModel =
                  project.settings?.stageModels?.analysis ??
                  project.settings?.model ??
                  config.openai.model;
                const existingChapter = await getChapter(projectId, chapterId, token, {
                  useServiceRole: true,
                });
                const preserveStatus =
                  existingChapter?.status === 'completed' || existingChapter?.status === 'draft';
                const preservedSource = existingChapter?.translationMeta?.source;
                await updateChapter(
                  projectId,
                  chapterId,
                  {
                    status: preserveStatus ? existingChapter!.status : 'analyzed',
                    translationMeta: {
                      ...(existingChapter?.translationMeta || {}),
                      tokensUsed: progResult.tokensUsed,
                      tokensByStage: {
                        ...(existingChapter?.translationMeta?.tokensByStage || {}),
                        analysis: progResult.tokensUsed,
                        translation:
                          existingChapter?.translationMeta?.tokensByStage?.translation ?? 0,
                        editing: existingChapter?.translationMeta?.tokensByStage?.editing ?? 0,
                      },
                      duration: 0,
                      model: analysisModel,
                      translatedAt: existingChapter?.translationMeta?.translatedAt ?? nowIso,
                      lastAnalysisAt: nowIso,
                      ...(preservedSource ? { source: preservedSource } : {}),
                    },
                  },
                  token,
                  { useServiceRole: true }
                );
              }

              await analysisJobStore.updateJob(jobId, {
                current: completedCount + errorCount,
                chapters: updatedChapters,
                totalTokensUsed: totalTokensAccum,
                currentChapterTitle: ch.title,
              });
            },
          })
      );

      clearInterval(cancelCheckInterval);
      if (await analysisJobStore.isCancelRequested(jobId)) {
        await analysisJobStore.updateJob(jobId, {
          status: 'canceled',
          finishedAt: new Date().toISOString(),
        });
        await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
        try {
          await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
        } catch (tokenError) {
          logger.warn({ err: tokenError }, 'Failed to release tokens on cancel (non-critical)');
        }
        return;
      }

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
          for (const entryId of chResult.glossaryAppearanceEntryIds) {
            const entry = await getGlossaryEntry(projectId, entryId, token, {
              useServiceRole: true,
            });
            if (entry) {
              const merged = [...new Set([...(entry.mentionedInChapters ?? []), chapterNum])].sort(
                (a, b) => a - b
              );
              await updateGlossaryEntry(
                projectId,
                entryId,
                { mentionedInChapters: merged },
                token,
                { useServiceRole: true }
              );
            } else {
              logger.warn(
                { projectId, entryId, chapterNum, chapterId: chResult.chapterId },
                'Glossary entry not found for chapter appearance merge'
              );
            }
          }
        }
      }

      try {
        await releaseTokens(userId, estimatedTokens, {
          tokensActual: result.totalTokensUsed,
          tokensByStage: {
            analysis: result.totalTokensUsed,
            translation: 0,
            editing: 0,
          },
          useServiceRole: true,
        });
      } catch (tokenError) {
        logger.warn({ err: tokenError }, 'Failed to release tokens (non-critical)');
      }

      await invalidateProjectAndRelatedCaches(userId, projectId, token, {
        useServiceRole: true,
      });

      const successful = result.chapterResults.filter((c) => c.success).length;
      const failed = result.chapterResults.filter((c) => !c.success).length;
      await analysisJobStore.updateJob(jobId, {
        status: 'completed',
        current: successful + failed,
        totalTokensUsed: result.totalTokensUsed,
        finishedAt: new Date().toISOString(),
      });
      await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
    } catch (bgErr) {
      clearInterval(cancelCheckInterval);
      const errMsg = bgErr instanceof Error ? bgErr.message : String(bgErr);
      logger.error({ err: bgErr }, `Analyze batch job ${jobId} failed: ${errMsg}`);
      await analysisJobStore.updateJob(jobId, {
        status: 'error',
        errors: [errMsg],
        finishedAt: new Date().toISOString(),
      });
      await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
      try {
        await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
      } catch (tokenError) {
        logger.warn({ err: tokenError }, 'Failed to release tokens on error (non-critical)');
      }
    } finally {
      await analysisJobStore.removeFromProjectIndex(projectId, jobId);
      await analysisJobStore.clearUserActiveJob(userId, jobId);
    }
  } catch (outerErr) {
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    logger.error({ err: outerErr }, `Analysis job ${jobId} failed: ${errMsg}`);
    await analysisJobStore.updateJob(jobId, {
      status: 'error',
      errors: [errMsg],
      finishedAt: new Date().toISOString(),
    });
    await analysisJobStore.setTtl(jobId, ANALYSIS_JOB_TTL_SECONDS);
    try {
      await releaseTokens(userId, estimatedTokens, { useServiceRole: true });
    } catch {
      /* ignore */
    }
    await analysisJobStore.removeFromProjectIndex(projectId, jobId);
    await analysisJobStore.clearUserActiveJob(userId, jobId);
  }
}
