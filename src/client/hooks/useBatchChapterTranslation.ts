import { useState, useRef, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
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

export type { BatchChapterProgressItem, BatchProgress, BatchProgressMode };

const INITIAL_POLL_MS = 1500;
const MAX_POLL_MS = 12000;
const MAX_POLL_ATTEMPTS = 90; // ~5 min with backoff

/**
 * Poll chapter status until translation completes or errors. Uses lightweight status endpoint and exponential backoff.
 */
async function pollChapterUntilDone(
  projectId: string,
  chapterId: string,
  isCancelled: () => boolean,
  _t: (key: string) => string
): Promise<{ success: boolean; cancelled?: boolean; partial?: boolean; error?: string }> {
  let delayMs = INITIAL_POLL_MS;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (isCancelled()) {
      return { success: false, cancelled: true, error: _t('projectInfo.errorCanceled') };
    }
    try {
      const { status } = await api.getChapterStatus(projectId, chapterId);
      if (status === 'completed' || status === 'analyzed' || status === 'draft') {
        return { success: true };
      }
      if (status === 'partial') {
        return { success: true, partial: true };
      }
      if (status === 'error') {
        return { success: false, error: _t('projectInfo.errorTranslation') };
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, MAX_POLL_MS);
    } catch (err) {
      console.error('Poll error:', err);
      return { success: false, error: _t('projectInfo.errorStatusCheck') };
    }
  }
  return { success: false, error: _t('projectInfo.errorTimeout') };
}

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
      const chaptersProgress: BatchChapterProgressItem[] = chapters.map((ch) => ({
        chapterId: ch.id,
        title: ch.title,
        status: ch.status === 'error' ? 'error' : 'pending',
      }));

      const chapterIds = chapters.map((chapter) => chapter.id);

      setProgress({
        mode: 'mark-translated',
        current: 0,
        total: chapters.length,
        currentChapter: null,
        currentChapterId: null,
        chapters: chaptersProgress,
        totalTokens: 0,
        totalDuration: 0,
        totalGlossaryEntries: 0,
        completed: 0,
        errors: 0,
        skipped: 0,
      });

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
                ? {
                    ...prev,
                    currentChapter: t('markAsTranslated.batchChunkProgress', {
                      from: chunkStart,
                      to: chunkEnd,
                      total: prev.total,
                    }),
                    currentChapterId: null,
                    chapters: prev.chapters.map((c) =>
                      chunkIds.includes(c.chapterId) && c.status === 'pending'
                        ? { ...c, status: 'translating' as const }
                        : c
                    ),
                  }
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
              const chapters = prev.chapters.map((chapter) => {
                if (
                  chapter.status === 'completed' ||
                  chapter.status === 'skipped' ||
                  chapter.status === 'error'
                ) {
                  return chapter;
                }
                return {
                  ...chapter,
                  status: 'error' as const,
                  reason: chapter.status === 'translating' ? errorMessage : 'not_processed',
                };
              });
              const errors = chapters.filter((c) => c.status === 'error').length;
              return {
                ...prev,
                current: chapters.filter(
                  (c) =>
                    c.status === 'completed' ||
                    c.status === 'skipped' ||
                    c.status === 'error' ||
                    c.status === 'partial'
                ).length,
                errors,
                currentChapter: errorMessage,
                chapters,
              };
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

        const body: ChapterTranslationOptions = {};
        if (optionsPerChapter?.paragraphIds?.length) {
          body.paragraphIds = optionsPerChapter.paragraphIds;
        } else if (optionsPerChapter?.translateOnlyEmpty) {
          body.translateOnlyEmpty = true;
        }
        if (optionsPerChapter?.stages !== undefined) {
          body.stages = optionsPerChapter.stages;
        }
        if (optionsPerChapter?.languagePair) {
          body.languagePair = optionsPerChapter.languagePair;
        }
        if (optionsPerChapter?.translateChapterTitles !== undefined) {
          body.translateChapterTitles = optionsPerChapter.translateChapterTitles;
        }

        const chaptersProgress: BatchChapterProgressItem[] = chapters.map((ch) => ({
          chapterId: ch.id,
          title: ch.title,
          status: ch.status === 'error' ? 'error' : 'pending',
        }));

        const onlyAnalysis =
          Array.isArray(optionsPerChapter?.stages) &&
          optionsPerChapter!.stages!.length === 1 &&
          optionsPerChapter!.stages![0] === 'analysis';
        const isAsyncBatch = chapters.length > 1;

        if (!isAsyncBatch) {
          setProgress({
            mode: 'translate',
            current: 0,
            total: chapters.length,
            currentChapter: null,
            currentChapterId: null,
            chapters: chaptersProgress,
            totalTokens: 0,
            totalDuration: 0,
            totalGlossaryEntries: 0,
            completed: 0,
            errors: 0,
            skipped: 0,
          });
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
                  prev
                    ? {
                        ...prev,
                        current: i + 1,
                        currentChapter: chapter.title,
                        currentChapterId: chapter.id,
                        chapters: prev.chapters.map((c) =>
                          c.chapterId === chapter.id ? { ...c, status: 'translating' as const } : c
                        ),
                      }
                    : null
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
                        ? {
                            ...prev,
                            completed: isPartial ? prev.completed : prev.completed + 1,
                            errors: isPartial ? prev.errors + 1 : prev.errors,
                            totalTokens: prev.totalTokens + tokensUsed,
                            totalDuration: prev.totalDuration + chapterDuration,
                            totalGlossaryEntries: currentGlossaryCount - batchStartGlossary,
                            chapters: prev.chapters.map((c) =>
                              c.chapterId === chapter.id
                                ? {
                                    ...c,
                                    status: isPartial
                                      ? ('partial' as const)
                                      : ('completed' as const),
                                    tokensUsed,
                                    tokensByStage,
                                    duration: chapterDuration,
                                    glossaryEntries,
                                  }
                                : c
                            ),
                          }
                        : null
                    );
                    initialGlossaryCountRef.current = currentGlossaryCount;
                  } else if (result.cancelled) {
                    setProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            chapters: prev.chapters.map((c) =>
                              c.chapterId === chapter.id ? { ...c, status: 'pending' as const } : c
                            ),
                          }
                        : null
                    );
                  } else {
                    setProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            errors: prev.errors + 1,
                            chapters: prev.chapters.map((c) =>
                              c.chapterId === chapter.id ? { ...c, status: 'error' as const } : c
                            ),
                          }
                        : null
                    );
                  }
                } catch (err: unknown) {
                  const status = (err as { status?: number })?.status;
                  const errorData = (err as { data?: { message?: string } })?.data;
                  console.error(`Translation error for chapter ${chapter.id}:`, err);

                  if (status === 429) {
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
                  if (status === 409) {
                    setProgress((prev) =>
                      prev
                        ? {
                            ...prev,
                            errors: prev.errors + 1,
                            chapters: prev.chapters.map((c) =>
                              c.chapterId === chapter.id ? { ...c, status: 'error' as const } : c
                            ),
                          }
                        : null
                    );
                    continue;
                  }

                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          errors: prev.errors + 1,
                          chapters: prev.chapters.map((c) =>
                            c.chapterId === chapter.id ? { ...c, status: 'error' as const } : c
                          ),
                        }
                      : null
                  );
                }
              }
            }
            await onRefreshProject();
          } catch (err) {
            const errData =
              err instanceof ApiError
                ? (err.data as { message?: string; error?: string } | undefined)
                : undefined;
            const msg =
              errData?.message ??
              errData?.error ??
              (err instanceof Error ? err.message : t('projectInfo.errorJobQueueUnavailable'));
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
