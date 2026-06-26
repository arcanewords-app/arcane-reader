/**
 * SSOT for chapter source text length (client + server token estimates, translate scope).
 */

import { isChunkError } from './chunkErrors.js';

export type ChapterSourceScope = 'full' | 'empty' | 'selected';

export interface ChapterSourceParagraph {
  id: string;
  originalText?: string;
  translatedText?: string | null;
}

export interface ChapterSourceInput {
  originalText?: string;
  paragraphs?: ChapterSourceParagraph[];
}

function sumParagraphOriginalText(paragraphs: ChapterSourceParagraph[]): number {
  return paragraphs.reduce((sum, p) => sum + (p.originalText ?? '').length, 0);
}

function resolveFullChapterSourceTextLength(chapter: ChapterSourceInput): number {
  const direct = (chapter.originalText ?? '').trim();
  if (direct.length > 0) return direct.length;
  if (chapter.paragraphs?.length) {
    return sumParagraphOriginalText(chapter.paragraphs);
  }
  return 0;
}

function hasValidTranslation(p: ChapterSourceParagraph): boolean {
  const t = (p.translatedText ?? '').trim();
  if (!t.length) return false;
  if (t.startsWith('❌') || isChunkError(t)) return false;
  return true;
}

/**
 * Resolve source character count for token estimation / translate scope.
 */
export function resolveChapterSourceTextLength(
  chapter: ChapterSourceInput,
  scope: ChapterSourceScope,
  selectedParagraphIds: string[] = []
): number {
  if (scope === 'selected' && selectedParagraphIds.length && chapter.paragraphs?.length) {
    const idSet = new Set(selectedParagraphIds);
    return chapter.paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + (p.originalText ?? '').length, 0);
  }
  if (scope === 'empty' && chapter.paragraphs?.length) {
    const empty = chapter.paragraphs.filter((p) => !hasValidTranslation(p));
    return empty.reduce((sum, p) => sum + (p.originalText ?? '').length, 0);
  }
  return resolveFullChapterSourceTextLength(chapter);
}

/** Length from translation options (paragraphIds / translateOnlyEmpty / full). */
export function resolveChapterSourceTextLengthFromOptions(
  chapter: ChapterSourceInput,
  options: {
    paragraphIds?: string[];
    translateOnlyEmpty?: boolean;
  } = {}
): number {
  if (options.paragraphIds?.length) {
    return resolveChapterSourceTextLength(chapter, 'selected', options.paragraphIds);
  }
  if (options.translateOnlyEmpty) {
    return resolveChapterSourceTextLength(chapter, 'empty');
  }
  return resolveChapterSourceTextLength(chapter, 'full');
}

/**
 * Chapter list summary: originalText, else paragraph sum, else paragraphCount heuristic.
 */
export function resolveChapterSummarySourceTextLength(chapter: {
  originalText?: string;
  paragraphs?: Array<{ originalText?: string }>;
  paragraphCount?: number;
}): number {
  const direct = (chapter.originalText ?? '').trim().length;
  if (direct > 0) return direct;
  const fromParagraphs = (chapter.paragraphs ?? []).reduce(
    (s, p) => s + (p.originalText ?? '').length,
    0
  );
  if (fromParagraphs > 0) return fromParagraphs;
  return (chapter.paragraphCount ?? 0) * 150;
}
