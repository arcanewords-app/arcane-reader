import { getTranslationCoverage } from './chapterTranslationCoverage.js';
import type { Chapter, ChapterStatus } from '../storage/database.js';

/**
 * Avoid copying in-progress or failed pipeline states into a static snapshot.
 */
export function normalizeCloneChapterStatus(chapter: Chapter): ChapterStatus {
  if (chapter.status !== 'translating' && chapter.status !== 'error') {
    return chapter.status;
  }

  const coverage = getTranslationCoverage(chapter.paragraphs);
  const hasAnyTranslation =
    coverage.translatedCount > 0 ||
    (chapter.translatedText?.trim().length ?? 0) > 0 ||
    (chapter.translatedChunks?.length ?? 0) > 0;

  if (!hasAnyTranslation) {
    if (chapter.translationMeta?.lastAnalysisAt) {
      return 'analyzed';
    }
    return 'pending';
  }

  if (coverage.isComplete) {
    return 'completed';
  }

  return 'partial';
}
