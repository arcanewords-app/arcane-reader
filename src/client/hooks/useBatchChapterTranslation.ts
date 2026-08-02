import { useState, useRef, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { estimateBatchTranslationTokensForProject } from '../config/tokenEstimate';
import { useTokenLimitCheck } from './useTokenLimitCheck';
import { getProject as getProjectFromStore } from '../store/projects';
import type { Chapter, ChapterSummary, Project, ProjectWithChapterList } from '../types';
import type { ChapterTranslationOptions } from './useChapterTranslation';
import {
  applyMarkTranslatedChunkToProgress,
  MARK_TRANSLATED_CLIENT_CHUNK_SIZE,
  type BatchChapterProgressItem,
  type BatchProgress,
  type BatchProgressMode,
} from './markTranslatedBatchProgress.js';
import { pollChapterUntilDone } from './batchTranslationPoll.js';
import {
  applyBatchAbortError,
  applySingleChapterResult,
  applySingleChapterTranslating,
  buildInitialChapterProgress,
  buildTranslationRequestBody,
  createEmptyBatchProgress,
  isOnlyAnalysisStages,
  markChunkChaptersTranslating,
  resolveBatchStartErrorMessage,
  shouldBreakOnTokenLimit,
  shouldContinueOnConflict,
} from './batchTranslationCore.js';

export type { BatchChapterProgressItem, BatchProgress, BatchProgressMode };

/**
 * Hook: batch translation of multiple chapters with token limit check and progress.
 * Before start, checks limit via useTokenLimitCheck. Loops: translateChapter → poll until done.
 * Returns startBatch, cancel, clearProgress, progress, isRunning, loadTokenUsage.
 */
export function useBatchChapterTranslation(
  projectId: string,
  project: Project | ProjectWithChapterList,
  onRefreshProject: () => Promise<void>,
  onError?: (title: string, message: string) => void,
  onBatchJobCreated?: () => void
) {
  const { t } = useTranslation();
  const {
    tokenUsage,
    checkBeforeTranslate,
    loadTokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
  } = useTokenLimitCheck();

  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const cancelledRef = useRef(false);
  const currentChapterIdRef = useRef<string | null>(null);
  const translateJobIdRef = useRef<string | null>(null);
  const analysisJobIdRef = useRef<string | null>(null);
  const markTranslatedAbortRef = useRef<AbortController | null>(null);
  const initialGlossaryCountRef = useRef(0);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (markTranslatedAbortRef.current) {
      markTranslatedAbortRef.current.abort();
    }
    if (currentChapterIdRef.current) {
      api.cancelTranslation(projectId, currentChapterIdRef.current).catch(() => {});
    }
    if (analysisJobIdRef.current) {
      api.cancelAnalysisJob(projectId, analysisJobIdRef.current).catch(() => {});
    }
    if (translateJobIdRef.current) {
      api.cancelTranslateJob(projectId, translateJobIdRef.current).catch(() => {});
    }
  }, [projectId]);

  const clearProgress = useCallback(() => {
    setProgress(null);
    cancelledRef.current = false;
    markTranslatedAbortRef.current = null;
    translateJobIdRef.current = null;
    analysisJobIdRef.current = null;
  }, []);

  const startMarkAsTranslatedBatch = useCallback(
    (chapters: Array<{ id: string; title: string; status?: string }>) => {
      if (chapters.length === 0) return;

      cancelledRef.current = false;
      const chaptersProgress = buildInitialChapterProgress(chapters);
      const chapterIds = chapters.map((chapter) => chapter.id);

      setProgress(createEmptyBatchProgress('mark-translated', chaptersProgress));

      (async () => {
        setIsRunning(true);
        try {
          const controller = new AbortController();
          markTranslatedAbortRef.current = controller;

          for (let i = 0; i < chapterIds.length; i += MARK_TRANSLATED_CLIENT_CHUNK_SIZE) {
            if (cancelledRef.current) break;

            const chunkIds = chapterIds.slice(i, i + MARK_TRANSLATED_CLIENT_CHUNK_SIZE);
            const chunkStart = i + 1;
            const chunkEnd = i + chunkIds.length;

            setProgress((prev) =>
              prev
                ? markChunkChaptersTranslating(
                    prev,
                    chunkIds,
                    t('markAsTranslated.batchChunkProgress', {
                      from: chunkStart,
                      to: chunkEnd,
                      total: prev.total,
                    })
                  )
                : null
            );

            const isLastChunk = i + MARK_TRANSLATED_CLIENT_CHUNK_SIZE >= chapterIds.length;
            const response = await api.markChaptersAsTranslatedBatch(projectId, chunkIds, {
              continueOnError: true,
              skipCacheInvalidation: !isLastChunk,
              signal: controller.signal,
            });

            if (cancelledRef.current) break;

            setProgress((prev) =>
              prev ? applyMarkTranslatedChunkToProgress(prev, response) : null
            );
          }

          if (!cancelledRef.current) {
            setProgress((prev) =>
              prev
                ? {
                    ...prev,
                    currentChapter: null,
                    currentChapterId: null,
                  }
                : null
            );
            await onRefreshProject();
          }
        } catch (err) {
          const errObj = err as { name?: string; message?: string };
          if (errObj.name !== 'AbortError') {
            console.error('Batch mark-as-translated failed:', err);
            setProgress((prev) => {
              if (!prev) return null;
              const errorMessage = errObj.message || t('projectInfo.errorTranslation');
              return applyBatchAbortError(prev, errorMessage);
            });
          }
        } finally {
          setIsRunning(false);
          cancelledRef.current = false;
          markTranslatedAbortRef.current = null;
        }
      })();
    },
    [projectId, onRefreshProject, t]
  );

  const startBatch = useCallback(
    (chapters: Array<Chapter | ChapterSummary>, optionsPerChapter?: ChapterTranslationOptions) => {
      if (chapters.length === 0) return;

      const estimatedTokens = estimateBatchTranslationTokensForProject(project, chapters, {
        stages: optionsPerChapter?.stages ?? 'all',
        translateChapterTitles: optionsPerChapter?.translateChapterTitles,
      });

      checkBeforeTranslate(estimatedTokens, () => {
        cancelledRef.current = false;
        initialGlossaryCountRef.current = project.glossary.length;

        const body = buildTranslationRequestBody(optionsPerChapter);
        const chaptersProgress = buildInitialChapterProgress(chapters);
        const onlyAnalysis = isOnlyAnalysisStages(optionsPerChapter?.stages);
        const isAsyncBatch = chapters.length > 1;

        if (!isAsyncBatch) {
          setProgress(createEmptyBatchProgress('translate', chaptersProgress));
        }

        (async () => {
          const batchStartGlossary = initialGlossaryCountRef.current;
          setIsRunning(true);

          try {
            if (onlyAnalysis && chapters.length > 1) {
              currentChapterIdRef.current = null;
              translateJobIdRef.current = null;
              const res = await api.startAnalyzeBatch(
                projectId,
                chapters.map((c) => c.id),
                {
                  languagePair: body.languagePair,
                }
              );
              analysisJobIdRef.current = res.jobId;
              onBatchJobCreated?.();
              // Async batch: job runs in background, JobsPanel shows progress
            } else if (chapters.length > 1) {
              currentChapterIdRef.current = null;
              analysisJobIdRef.current = null;
              const res = await api.startTranslateBatch(
                projectId,
                chapters.map((c) => c.id),
                {
                  translateOnlyEmpty: body.translateOnlyEmpty,
                  translateChapterTitles: body.translateChapterTitles,
                  stages: body.stages,
                  languagePair: body.languagePair,
                }
              );
              translateJobIdRef.current = res.jobId;
              onBatchJobCreated?.();
              // Async batch: job runs in background, JobsPanel shows progress
            } else {
              for (let i = 0; i < chapters.length; i++) {
                if (cancelledRef.current) break;

                const chapter = chapters[i];
                const chapterStartTime = Date.now();

                currentChapterIdRef.current = chapter.id;
                setProgress((prev) =>
                  prev ? applySingleChapterTranslating(prev, chapter, i) : null
                );

                try {
                  await api.translateChapter(projectId, chapter.id, body);
                  const result = await pollChapterUntilDone(
                    projectId,
                    chapter.id,
                    () => cancelledRef.current,
                    t
                  );

                  await onRefreshProject();
                  const updatedProject = await getProjectFromStore(projectId);
                  const updatedChapter = updatedProject?.chapters.find((c) => c.id === chapter.id);

                  if (result.success && updatedProject && updatedChapter) {
                    const chapterDuration =
                      updatedChapter.translationMeta?.duration ?? Date.now() - chapterStartTime;
                    const tokensUsed = updatedChapter.translationMeta?.tokensUsed ?? 0;
                    const tokensByStage = updatedChapter.translationMeta?.tokensByStage;
                    const currentGlossaryCount = updatedProject.glossary.length;
                    const prevGlossaryCount = initialGlossaryCountRef.current;
                    const glossaryEntries = Math.max(0, currentGlossaryCount - prevGlossaryCount);
                    const isPartial =
                      result.partial === true || updatedChapter.status === 'partial';

                    setProgress((prev) =>
                      prev
                        ? applySingleChapterResult(prev, {
                            chapterId: chapter.id,
                            success: true,
                            partial: isPartial,
                            tokensUsed,
                            tokensByStage,
                            duration: chapterDuration,
                            glossaryEntries,
                            totalGlossaryEntries: currentGlossaryCount - batchStartGlossary,
                          })
                        : null
                    );
                    initialGlossaryCountRef.current = currentGlossaryCount;
                  } else if (result.cancelled) {
                    setProgress((prev) =>
                      prev
                        ? applySingleChapterResult(prev, {
                            chapterId: chapter.id,
                            success: false,
                            cancelled: true,
                          })
                        : null
                    );
                  } else {
                    setProgress((prev) =>
                      prev
                        ? applySingleChapterResult(prev, {
                            chapterId: chapter.id,
                            success: false,
                          })
                        : null
                    );
                  }
                } catch (err: unknown) {
                  const status = (err as { status?: number })?.status;
                  const errorData = (err as { data?: { message?: string } })?.data;
                  console.error(`Translation error for chapter ${chapter.id}:`, err);

                  if (shouldBreakOnTokenLimit(status)) {
                    const msg = t('projectInfo.tokenLimitExceededChapter', {
                      title: chapter.title,
                      message: errorData?.message ?? t('tokenLimit.dailyExhaustedShort'),
                    });
                    if (onError) {
                      onError(t('tokenLimit.titleExceeded'), msg);
                    } else {
                      alert(msg);
                    }
                    if (authService.isAuthenticated()) loadTokenUsage();
                    break;
                  }

                  // 409 = translation already in progress (e.g. another tab or duplicate request); do not retry
                  if (shouldContinueOnConflict(status)) {
                    setProgress((prev) =>
                      prev
                        ? applySingleChapterResult(prev, {
                            chapterId: chapter.id,
                            success: false,
                          })
                        : null
                    );
                    continue;
                  }

                  setProgress((prev) =>
                    prev
                      ? applySingleChapterResult(prev, {
                          chapterId: chapter.id,
                          success: false,
                        })
                      : null
                  );
                }
              }
            }
            await onRefreshProject();
          } catch (err) {
            const msg = resolveBatchStartErrorMessage(
              err,
              t('projectInfo.errorJobQueueUnavailable')
            );
            if (onError) {
              onError(t('projectInfo.errorBatchStartTitle'), msg);
            }
            console.error('Batch start failed:', err);
          } finally {
            setIsRunning(false);
            cancelledRef.current = false;
            currentChapterIdRef.current = null;
            translateJobIdRef.current = null;
            analysisJobIdRef.current = null;
          }
        })();
      });
    },
    [
      projectId,
      project,
      checkBeforeTranslate,
      onRefreshProject,
      loadTokenUsage,
      onError,
      onBatchJobCreated,
      t,
    ]
  );

  return {
    startBatch,
    startMarkAsTranslatedBatch,
    cancel,
    clearProgress,
    progress,
    isRunning,
    tokenUsage,
    loadTokenUsage,
    warningState,
    closeWarning,
    confirmAndProceed,
  };
}
