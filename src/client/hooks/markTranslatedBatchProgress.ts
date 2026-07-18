import type { MarkTranslatedBatchResponse, MarkTranslatedBatchResultItem } from '../types';

export interface BatchChapterProgressItem {
  chapterId: string;
  title: string;
  status: 'pending' | 'translating' | 'completed' | 'partial' | 'error' | 'skipped';
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

export type BatchProgressMode = 'translate' | 'mark-translated';

export interface BatchProgress {
  mode: BatchProgressMode;
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

/** Client HTTP chunk size — keeps each request under Vercel maxDuration (~300s). */
export const MARK_TRANSLATED_CLIENT_CHUNK_SIZE = 100;

function mapMarkTranslatedResultToChapterStatus(
  item: MarkTranslatedBatchResultItem
): Pick<BatchChapterProgressItem, 'status' | 'reason'> {
  if (item.status === 'success') {
    return { status: 'completed', reason: undefined };
  }
  if (item.status === 'skipped') {
    return { status: 'skipped', reason: item.reason };
  }
  return { status: 'error', reason: item.reason };
}

export function applyMarkTranslatedChunkToProgress(
  prev: BatchProgress,
  response: MarkTranslatedBatchResponse
): BatchProgress {
  const resultMap = new Map(response.results.map((item) => [item.chapterId, item]));
  const chapters = prev.chapters.map((chapter) => {
    const item = resultMap.get(chapter.chapterId);
    if (!item) return chapter;
    return { ...chapter, ...mapMarkTranslatedResultToChapterStatus(item) };
  });

  return {
    ...prev,
    current: prev.current + response.summary.processed,
    completed: prev.completed + response.summary.success,
    errors: prev.errors + response.summary.failed,
    skipped: prev.skipped + response.summary.skipped,
    chapters,
  };
}
