import { useState, useRef, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { useTokenEstimate } from './useTokenEstimate';
import { useTokenLimitCheck } from './useTokenLimitCheck';
import type { Chapter, Project } from '../types';
import type { ChapterTranslationOptions } from './useChapterTranslation';

export interface BatchChapterProgressItem {
  chapterId: string;
  title: string;
  status: 'pending' | 'translating' | 'completed' | 'error';
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
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

/**
 * Poll chapter status until translation completes or errors.
 */
async function pollChapterUntilDone(
  projectId: string,
  chapterId: string,
  isCancelled: () => boolean,
  _t: (key: string) => string
): Promise<{ success: boolean; chapter?: Chapter; error?: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (isCancelled()) {
      return { success: false, error: _t('projectInfo.errorCanceled') };
    }
    try {
      const chapter = await api.getChapter(projectId, chapterId);
      if (chapter.status === 'completed') {
        return { success: true, chapter };
      }
      if (chapter.status === 'error') {
        return { success: false, error: _t('projectInfo.errorTranslation') };
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
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
  project: Project,
  onRefreshProject: () => Promise<void>
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
  const initialGlossaryCountRef = useRef(0);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (currentChapterIdRef.current) {
      api.cancelTranslation(projectId, currentChapterIdRef.current).catch(() => {});
    }
  }, [projectId]);

  const clearProgress = useCallback(() => {
    setProgress(null);
    cancelledRef.current = false;
  }, []);

  const startMarkAsTranslatedBatch = useCallback(
    (chapters: Chapter[]) => {
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
      });

      (async () => {
        setIsRunning(true);
        try {
          for (let i = 0; i < chapters.length; i++) {
            if (cancelledRef.current) break;

            const chapter = chapters[i];
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
              await api.markChapterAsTranslated(projectId, chapter.id);
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      completed: prev.completed + 1,
                      chapters: prev.chapters.map((c) =>
                        c.chapterId === chapter.id ? { ...c, status: 'completed' as const } : c
                      ),
                    }
                  : null
              );
            } catch (err) {
              console.error(`Mark as translated error for chapter ${chapter.id}:`, err);
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
            await onRefreshProject();
          }
        } finally {
          setIsRunning(false);
          cancelledRef.current = false;
        }
      })();
    },
    [projectId, onRefreshProject]
  );

  const startBatch = useCallback(
    (chapters: Chapter[], optionsPerChapter?: ChapterTranslationOptions) => {
      if (chapters.length === 0) return;

      const totalLength = chapters.reduce((sum, ch) => sum + ch.originalText.length, 0);
      const stagesForEstimate = optionsPerChapter?.stages ?? 'all';
      const estimatedTokens = estimate(totalLength, stagesForEstimate);

      checkBeforeTranslate(estimatedTokens, () => {
        cancelledRef.current = false;
        initialGlossaryCountRef.current = project.glossary.length;

        const body: { translateOnlyEmpty?: boolean; paragraphIds?: string[]; stages?: ChapterTranslationOptions['stages'] } = {};
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
        });

        (async () => {
          const batchStartGlossary = initialGlossaryCountRef.current;
          setIsRunning(true);
          try {
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
                const updatedProject = await api.getProject(projectId);
                const updatedChapter = updatedProject.chapters.find((c) => c.id === chapter.id);

                if (result.success && updatedChapter) {
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
                  alert(
                    t('projectInfo.tokenLimitExceededChapter', {
                      title: chapter.title,
                      message: errorData?.message ?? t('tokenLimit.dailyExhaustedShort'),
                    })
                  );
                  if (authService.isAuthenticated()) loadTokenUsage();
                  break;
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
            await onRefreshProject();
          } finally {
            setIsRunning(false);
            cancelledRef.current = false;
            currentChapterIdRef.current = null;
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
