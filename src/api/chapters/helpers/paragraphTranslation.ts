/**
 * Paragraph translation validity checks — extracted from chapters routes.
 */

import { isChunkError } from '../../../shared/chunkErrors.js';

export function hasValidParagraphTranslation(p: { translatedText?: string | null }): boolean {
  const t = p.translatedText?.trim() || '';
  if (!t.length) return false;
  if (t.startsWith('❌') || isChunkError(t)) return false;
  return true;
}

export function computeTranslationTextLength(
  chapterOriginalLength: number,
  paragraphs:
    Array<{ id: string; originalText: string; translatedText?: string | null }> | undefined,
  options: { paragraphIds?: string[]; translateOnlyEmpty?: boolean }
): number {
  const { paragraphIds, translateOnlyEmpty } = options;
  if (paragraphIds?.length && paragraphs?.length) {
    const idSet = new Set(paragraphIds);
    return paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + p.originalText.length, 0);
  }
  if (translateOnlyEmpty && paragraphs?.length) {
    const empty = paragraphs.filter((p) => !hasValidParagraphTranslation(p));
    return empty.reduce((sum, p) => sum + p.originalText.length, 0);
  }
  return chapterOriginalLength;
}
