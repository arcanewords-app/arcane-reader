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

export function normalizeMarkTranslatedBatchReasonCode(reason: string | undefined): string | null {
  if (!reason?.trim()) return null;
  const normalized = reason.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'translating') return 'translation_in_progress';
  return normalized;
}

type MarkTranslatedReasonTranslator = (key: string, defaultValue?: string) => string;

export function formatMarkTranslatedBatchReason(
  reason: string | undefined,
  t: MarkTranslatedReasonTranslator
): string | undefined {
  const code = normalizeMarkTranslatedBatchReasonCode(reason);
  if (!code) return undefined;

  const key = `markAsTranslated.reason.${code}`;
  const translated = t(key, '');
  if (translated && translated !== key) {
    return translated;
  }

  const unknown = t('markAsTranslated.reason.unknown', '');
  return unknown && unknown !== 'markAsTranslated.reason.unknown'
    ? unknown
    : 'Could not mark as translated';
}

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
