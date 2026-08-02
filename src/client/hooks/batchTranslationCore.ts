/**
 * Pure helpers for batch chapter translation / mark-as-translated flows.
 */

import type { ChapterTranslationOptions } from './useChapterTranslation.js';
import type { BatchChapterProgressItem, BatchProgress } from './markTranslatedBatchProgress.js';

export function buildInitialChapterProgress(
  chapters: Array<{ id: string; title: string; status?: string }>
): BatchChapterProgressItem[] {
  return chapters.map((ch) => ({
    chapterId: ch.id,
    title: ch.title,
    status: ch.status === 'error' ? 'error' : 'pending',
  }));
}

export function createEmptyBatchProgress(
  mode: BatchProgress['mode'],
  chapters: BatchChapterProgressItem[]
): BatchProgress {
  return {
    mode,
    current: 0,
    total: chapters.length,
    currentChapter: null,
    currentChapterId: null,
    chapters,
    totalTokens: 0,
    totalDuration: 0,
    totalGlossaryEntries: 0,
    completed: 0,
    errors: 0,
    skipped: 0,
  };
}

export function buildTranslationRequestBody(
  optionsPerChapter?: ChapterTranslationOptions
): ChapterTranslationOptions {
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
  return body;
}

export function isOnlyAnalysisStages(stages: ChapterTranslationOptions['stages']): boolean {
  return Array.isArray(stages) && stages.length === 1 && stages[0] === 'analysis';
}

export function markChunkChaptersTranslating(
  progress: BatchProgress,
  chunkIds: string[],
  currentChapterLabel: string
): BatchProgress {
  return {
    ...progress,
    currentChapter: currentChapterLabel,
    currentChapterId: null,
    chapters: progress.chapters.map((c) =>
      chunkIds.includes(c.chapterId) && c.status === 'pending'
        ? { ...c, status: 'translating' as const }
        : c
    ),
  };
}

export function applyBatchAbortError(progress: BatchProgress, errorMessage: string): BatchProgress {
  const chapters = progress.chapters.map((chapter) => {
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
    ...progress,
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
}

export function applySingleChapterTranslating(
  progress: BatchProgress,
  chapter: { id: string; title: string },
  currentIndex: number
): BatchProgress {
  return {
    ...progress,
    current: currentIndex + 1,
    currentChapter: chapter.title,
    currentChapterId: chapter.id,
    chapters: progress.chapters.map((c) =>
      c.chapterId === chapter.id ? { ...c, status: 'translating' as const } : c
    ),
  };
}

export function applySingleChapterResult(
  progress: BatchProgress,
  input: {
    chapterId: string;
    success: boolean;
    cancelled?: boolean;
    partial?: boolean;
    tokensUsed?: number;
    tokensByStage?: BatchChapterProgressItem['tokensByStage'];
    duration?: number;
    glossaryEntries?: number;
    totalGlossaryEntries?: number;
  }
): BatchProgress {
  if (input.cancelled) {
    return {
      ...progress,
      chapters: progress.chapters.map((c) =>
        c.chapterId === input.chapterId ? { ...c, status: 'pending' as const } : c
      ),
    };
  }

  if (!input.success) {
    return {
      ...progress,
      errors: progress.errors + 1,
      chapters: progress.chapters.map((c) =>
        c.chapterId === input.chapterId ? { ...c, status: 'error' as const } : c
      ),
    };
  }

  const isPartial = input.partial === true;
  return {
    ...progress,
    completed: isPartial ? progress.completed : progress.completed + 1,
    errors: isPartial ? progress.errors + 1 : progress.errors,
    totalTokens: progress.totalTokens + (input.tokensUsed ?? 0),
    totalDuration: progress.totalDuration + (input.duration ?? 0),
    totalGlossaryEntries: input.totalGlossaryEntries ?? progress.totalGlossaryEntries,
    chapters: progress.chapters.map((c) =>
      c.chapterId === input.chapterId
        ? {
            ...c,
            status: isPartial ? ('partial' as const) : ('completed' as const),
            tokensUsed: input.tokensUsed,
            tokensByStage: input.tokensByStage,
            duration: input.duration,
            glossaryEntries: input.glossaryEntries,
          }
        : c
    ),
  };
}

export function resolveBatchStartErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { message?: string; error?: string } }).data;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function shouldBreakOnTokenLimit(status: number | undefined): boolean {
  return status === 429;
}

export function shouldContinueOnConflict(status: number | undefined): boolean {
  return status === 409;
}
