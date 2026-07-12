/**
 * Analysis chapter update payload — extracted from analyze-batch handler.
 */

import type { Chapter, ChapterStatus } from '../../../storage/database.js';

export interface AnalysisChapterResultLike {
  tokensUsed: number;
}

export interface BuildAnalysisChapterUpdateInput {
  existingChapter: Chapter | null | undefined;
  chResult: AnalysisChapterResultLike;
  totalDuration: number;
  analysisModel: string;
  nowIso?: string;
}

export function buildAnalysisChapterUpdate(input: BuildAnalysisChapterUpdateInput): {
  status: ChapterStatus;
  translationMeta: NonNullable<Chapter['translationMeta']>;
} {
  const { existingChapter, chResult, totalDuration, analysisModel } = input;
  const nowIso = input.nowIso ?? new Date().toISOString();

  const preserveStatus =
    existingChapter?.status === 'completed' ||
    existingChapter?.status === 'draft' ||
    existingChapter?.status === 'partial';
  const preservedSource = existingChapter?.translationMeta?.source;

  return {
    status: preserveStatus ? existingChapter!.status : 'analyzed',
    translationMeta: {
      ...(existingChapter?.translationMeta || {}),
      tokensUsed: chResult.tokensUsed,
      tokensByStage: {
        ...(existingChapter?.translationMeta?.tokensByStage || {}),
        analysis: chResult.tokensUsed,
        translation: existingChapter?.translationMeta?.tokensByStage?.translation ?? 0,
        editing: existingChapter?.translationMeta?.tokensByStage?.editing ?? 0,
      },
      duration: totalDuration,
      model: analysisModel,
      translatedAt: existingChapter?.translationMeta?.translatedAt ?? nowIso,
      lastAnalysisAt: nowIso,
      ...(preservedSource ? { source: preservedSource } : {}),
    },
  };
}
