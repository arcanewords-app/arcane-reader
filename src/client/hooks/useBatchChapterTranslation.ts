import { useState, useRef, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { useTokenEstimate } from './useTokenEstimate';
import { useTokenLimitCheck } from './useTokenLimitCheck';
import { getProject as getProjectFromStore } from '../store/projects';
import type { Chapter, ChapterSummary, Project, ProjectWithChapterList } from '../types';
import type { ChapterTranslationOptions } from './useChapterTranslation';

export interface BatchChapterProgressItem {
  chapterId: string;
  title: string;
  status: 'pending' | 'translating' | 'completed' | 'error' | 'skipped';
  reason?: string;
  tokensUsed?: number;
  tokensByStage?: {
    analysis?: number;
    translation: number;
    editing?: number;
  };
  duration?: number;
  glossaryEntries?: number;
}

export interface BatchProgress {
  current: number;
  total: number;
  currentChapter: string | null;
  currentChapterId: string | null;
  chapters: BatchChapterProgressItem[];
  totalTokens: number;
  totalDuration: number;
  totalGlossaryEntries: number;
  completed: number;
  errors: number;
  skipped: number;
}

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
): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
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
  onError?: (title: string, message: string) => void
) {
  const { t } = useTranslation();
  const estimate = useTokenEstimate();
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
    if (translateJobIdRef.current) {
      api.cancelTranslateJob(projectId, translateJobIdRef.current).catch(() => {});
    }
  }, [projectId]);

  const clearProgress = useCallback(() => {
    setProgress(null);
    cancelledRef.current = false;
    markTranslatedAbortRef.current = null;
    translateJobIdRef.current = null;
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

      setProgress({
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
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  currentChapter: t(
                    'markAsTranslated.batchInProgress',
                    'Batch update in progress...'
                  ),
                  currentChapterId: null,
                  chapters: prev.chapters.map((c) => ({ ...c, status: 'translating' as const })),
                }
              : null
          );

          const response = await api.markChaptersAsTranslatedBatch(
            projectId,
            chapters.map((chapter) => chapter.id),
            { continueOnError: true, signal: controller.signal }
          );

          if (!cancelledRef.current) {
            setProgress((prev) => {
              if (!prev) return null;
              const resultMap = new Map(response.results.map((item) => [item.chapterId, item]));
              return {
                ...prev,
                current: response.summary.processed,
                currentChapter: null,
                currentChapterId: null,
                completed: response.summary.success,
                errors: response.summary.failed,
                skipped: response.summary.skipped,
                chapters: prev.chapters.map((chapter) => {
                  const item = resultMap.get(chapter.chapterId);
                  if (!item) {
                    return { ...chapter, status: 'error' as const, reason: 'not_processed' };
                  }
                  if (item.status === 'success') {
                    return { ...chapter, status: 'completed' as const, reason: undefined };
                  }
                  if (item.status === 'skipped') {
                    return { ...chapter, status: 'skipped' as const, reason: item.reason };
                  }
                  return { ...chapter, status: 'error' as const, reason: item.reason };
                }),
              };
            });
            await onRefreshProject();
          }
        } catch (err) {
          const errObj = err as { name?: string; message?: string };
          if (errObj.name !== 'AbortError') {
            console.error('Batch mark-as-translated failed:', err);
            setProgress((prev) =>
              prev
                ? {
                    ...prev,
                    errors: prev.total,
                    currentChapter: errObj.message || t('projectInfo.errorTranslation'),
                    chapters: prev.chapters.map((chapter) => ({
                      ...chapter,
                      status: 'error' as const,
                    })),
                  }
                : null
            );
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

      const totalLength = chapters.reduce((sum, ch) => {
        const full = ch as Chapter;
        if (full.originalText) return sum + full.originalText.length;
        const fromPar = (full.paragraphs || []).reduce(
          (s, p) => s + (p.originalText || '').length,
          0
        );
        if (fromPar > 0) return sum + fromPar;
        return sum + ((ch as ChapterSummary).paragraphCount ?? 0) * 150;
      }, 0);
      const stagesForEstimate = optionsPerChapter?.stages ?? 'all';
      const estimatedTokens = estimate(totalLength, stagesForEstimate);

      checkBeforeTranslate(estimatedTokens, () => {
        cancelledRef.current = false;
        initialGlossaryCountRef.current = project.glossary.length;

        const body: {
          translateOnlyEmpty?: boolean;
          paragraphIds?: string[];
          stages?: ChapterTranslationOptions['stages'];
        } = {};
        if (optionsPerChapter?.paragraphIds?.length) {
          body.paragraphIds = optionsPerChapter.paragraphIds;
        } else if (optionsPerChapter?.translateOnlyEmpty) {
          body.translateOnlyEmpty = true;
        }
        if (optionsPerChapter?.stages !== undefined) {
          body.stages = optionsPerChapter.stages;
        }

        const chaptersProgress: BatchChapterProgressItem[] = chapters.map((ch) => ({
          chapterId: ch.id,
          title: ch.title,
          status: ch.status === 'error' ? 'error' : 'pending',
        }));

        setProgress({
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
          const batchStartGlossary = initialGlossaryCountRef.current;
          setIsRunning(true);
          const onlyAnalysis =
            Array.isArray(optionsPerChapter?.stages) &&
            optionsPerChapter!.stages!.length === 1 &&
            optionsPerChapter!.stages![0] === 'analysis';

          try {
            if (onlyAnalysis && chapters.length > 1) {
              currentChapterIdRef.current = null;
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      currentChapter: t('projectInfo.batchAnalyzing', 'Batch analysis...'),
                      currentChapterId: null,
                      chapters: prev.chapters.map((c) => ({
                        ...c,
                        status: 'translating' as const,
                      })),
                    }
                  : null
              );
              const { jobId } = await api.startAnalyzeBatch(
                projectId,
                chapters.map((c) => c.id),
                undefined
              );
              const ANALYSIS_POLL_MIN_MS = 1500;
              const ANALYSIS_POLL_MAX_MS = 8000;
              const ANALYSIS_POLL_BACKOFF = 1.5;
              let pollDelayMs = ANALYSIS_POLL_MIN_MS;
              let previousSnapshot = '';
              // eslint-disable-next-line no-constant-condition -- exits by terminal statuses
              while (true) {
                if (cancelledRef.current) {
                  await api.cancelAnalysisJob(projectId, jobId).catch(() => {});
                  break;
                }
                const state = await api.getAnalysisJob(projectId, jobId, undefined);
                const currentSnapshot = `${state.status}|${state.current}|${state.total}|${state.currentChapterTitle ?? ''}`;
                const hasStateChanged = currentSnapshot !== previousSnapshot;
                previousSnapshot = currentSnapshot;

                const chapterIdToJobChapter = new Map(
                  state.chapters.map((jc) => [jc.chapterId, jc])
                );
                const completedCount = state.chapters.filter((c) => c.status === 'completed').length;
                const errorCount = state.chapters.filter((c) => c.status === 'error').length;

                setProgress((prev) => {
                  if (!prev) return null;
                  const chapters = prev.chapters.map((c) => {
                    const jc = chapterIdToJobChapter.get(c.chapterId);
                    if (!jc) return c;
                    const statusMap = {
                      pending: 'translating' as const,
                      processing: 'translating' as const,
                      completed: 'completed' as const,
                      error: 'error' as const,
                    };
                    return {
                      ...c,
                      status: statusMap[jc.status],
                      tokensUsed: jc.tokensUsed,
                      tokensByStage:
                        jc.status === 'completed' && jc.tokensUsed != null
                          ? { analysis: jc.tokensUsed, translation: 0, editing: 0 }
                          : undefined,
                    };
                  });
                  return {
                    ...prev,
                    current: state.current,
                    currentChapter: state.currentChapterTitle ?? prev.currentChapter,
                    completed: completedCount,
                    errors: errorCount,
                    totalTokens: state.totalTokensUsed,
                    totalGlossaryEntries: 0,
                    chapters,
                  };
                });

                if (state.status === 'completed') {
                  await onRefreshProject();
                  const updatedProject = await getProjectFromStore(projectId);
                  const currentGlossaryCount = updatedProject?.glossary.length ?? 0;
                  const glossaryAdded = currentGlossaryCount - batchStartGlossary;
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                          totalGlossaryEntries: glossaryAdded,
                          chapters: prev.chapters.map((c) => {
                            const jc = chapterIdToJobChapter.get(c.chapterId);
                            const isCompleted = jc?.status === 'completed';
                            return {
                              ...c,
                              status: isCompleted ? ('completed' as const) : ('error' as const),
                              tokensUsed: jc?.tokensUsed,
                              tokensByStage: isCompleted && jc?.tokensUsed != null
                                ? { analysis: jc.tokensUsed, translation: 0, editing: 0 }
                                : undefined,
                              glossaryEntries: isCompleted ? glossaryAdded : undefined,
                            };
                          }),
                        }
                      : null
                  );
                  initialGlossaryCountRef.current = currentGlossaryCount;
                  break;
                }

                if (state.status === 'error') {
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                          errors: prev.errors + (state.errors?.length ?? 0),
                          chapters: prev.chapters.map((c) => ({
                            ...c,
                            status: 'error' as const,
                            reason: state.errors?.[0],
                          })),
                        }
                      : null
                  );
                  onError?.(
                    t('projectInfo.batchAnalyzing', 'Batch analysis'),
                    state.errors?.join('\n') ?? 'Analysis job failed'
                  );
                  break;
                }

                if (state.status === 'canceled') {
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                        }
                      : null
                  );
                  break;
                }

                if (hasStateChanged) {
                  pollDelayMs = ANALYSIS_POLL_MIN_MS;
                } else {
                  pollDelayMs = Math.min(
                    ANALYSIS_POLL_MAX_MS,
                    Math.round(pollDelayMs * ANALYSIS_POLL_BACKOFF)
                  );
                }
                await new Promise((r) => setTimeout(r, pollDelayMs));
              }
            } else if (chapters.length > 1) {
              currentChapterIdRef.current = null;
              translateJobIdRef.current = null;
              const { jobId } = await api.startTranslateBatch(
                projectId,
                chapters.map((c) => c.id),
                {
                  translateOnlyEmpty: body.translateOnlyEmpty,
                  stages: body.stages,
                },
                undefined
              );
              translateJobIdRef.current = jobId;

              const TRANSLATE_POLL_MIN_MS = 1500;
              const TRANSLATE_POLL_MAX_MS = 8000;
              const TRANSLATE_POLL_BACKOFF = 1.5;
              let pollDelayMs = TRANSLATE_POLL_MIN_MS;
              let previousSnapshot = '';

              // eslint-disable-next-line no-constant-condition -- exits by terminal statuses
              while (true) {
                if (cancelledRef.current) {
                  await api.cancelTranslateJob(projectId, jobId).catch(() => {});
                  translateJobIdRef.current = null;
                  break;
                }
                const state = await api.getTranslateJob(projectId, jobId, undefined);
                const currentSnapshot = `${state.status}|${state.current}|${state.total}|${state.currentChapterTitle ?? ''}`;
                const hasStateChanged = currentSnapshot !== previousSnapshot;
                previousSnapshot = currentSnapshot;

                const chapterIdToJobChapter = new Map(
                  state.chapters.map((jc) => [jc.chapterId, jc])
                );
                const completedCount = state.chapters.filter((c) => c.status === 'completed').length;
                const errorCount = state.chapters.filter((c) => c.status === 'error').length;

                setProgress((prev) => {
                  if (!prev) return null;
                  const chaptersMapped = prev.chapters.map((c) => {
                    const jc = chapterIdToJobChapter.get(c.chapterId);
                    if (!jc) return c;
                    const statusMap = {
                      pending: 'translating' as const,
                      processing: 'translating' as const,
                      completed: 'completed' as const,
                      error: 'error' as const,
                    };
                    return {
                      ...c,
                      status: statusMap[jc.status],
                      tokensUsed: jc.tokensUsed,
                      tokensByStage: jc.tokensByStage,
                      duration: jc.duration,
                    };
                  });
                  return {
                    ...prev,
                    current: state.current,
                    currentChapter: state.currentChapterTitle ?? prev.currentChapter,
                    currentChapterId: null,
                    completed: completedCount,
                    errors: errorCount,
                    totalTokens: state.totalTokensUsed,
                    chapters: chaptersMapped,
                  };
                });

                if (state.status === 'completed') {
                  translateJobIdRef.current = null;
                  await onRefreshProject();
                  const updatedProject = await getProjectFromStore(projectId);
                  const currentGlossaryCount = updatedProject?.glossary.length ?? 0;
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                          totalGlossaryEntries: currentGlossaryCount - batchStartGlossary,
                        }
                      : null
                  );
                  initialGlossaryCountRef.current = currentGlossaryCount;
                  break;
                }

                if (state.status === 'error') {
                  translateJobIdRef.current = null;
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                          errors: prev.errors + (state.errors?.length ?? 0),
                          chapters: prev.chapters.map((c) => ({
                            ...c,
                            status: 'error' as const,
                            reason: state.errors?.[0],
                          })),
                        }
                      : null
                  );
                  onError?.(
                    t('projectInfo.batchTranslating', 'Batch translation'),
                    state.errors?.join('\n') ?? 'Translate job failed'
                  );
                  break;
                }

                if (state.status === 'canceled') {
                  translateJobIdRef.current = null;
                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          currentChapter: null,
                          currentChapterId: null,
                        }
                      : null
                  );
                  break;
                }

                if (hasStateChanged) {
                  pollDelayMs = TRANSLATE_POLL_MIN_MS;
                } else {
                  pollDelayMs = Math.min(
                    TRANSLATE_POLL_MAX_MS,
                    Math.round(pollDelayMs * TRANSLATE_POLL_BACKOFF)
                  );
                }
                await new Promise((r) => setTimeout(r, pollDelayMs));
              }
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

                  setProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          completed: prev.completed + 1,
                          totalTokens: prev.totalTokens + tokensUsed,
                          totalDuration: prev.totalDuration + chapterDuration,
                          totalGlossaryEntries: currentGlossaryCount - batchStartGlossary,
                          chapters: prev.chapters.map((c) =>
                            c.chapterId === chapter.id
                              ? {
                                  ...c,
                                  status: 'completed' as const,
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
          } finally {
            setIsRunning(false);
            cancelledRef.current = false;
            currentChapterIdRef.current = null;
            translateJobIdRef.current = null;
          }
        })();
      });
    },
    [
      projectId,
      project.glossary.length,
      estimate,
      checkBeforeTranslate,
      onRefreshProject,
      loadTokenUsage,
      onError,
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
