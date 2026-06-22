/**
 * SSOT for chapter translation paragraph coverage (server + client).
 * Mirrors separator / valid-translation rules used in server sync helpers.
 */

import { isChunkError } from './chunkErrors.js';

export interface ParagraphCoverageInput {
  id: string;
  originalText: string;
  translatedText?: string | null;
}

export interface TranslationCoverage {
  /** Content paragraphs (non-separator, non-empty original). */
  contentTotal: number;
  /** Content paragraphs with valid translatedText. */
  translatedCount: number;
  isComplete: boolean;
  missingParagraphIds: string[];
}

const SEPARATOR_PATTERN = /^[\s*\-_=~#]+$/;

export function isSeparatorParagraph(p: ParagraphCoverageInput): boolean {
  const text = (p.originalText ?? '').trim();
  if (text.length === 0) return false;
  return SEPARATOR_PATTERN.test(text);
}

export function isContentParagraph(p: ParagraphCoverageInput): boolean {
  const original = (p.originalText ?? '').trim();
  if (original.length === 0) return false;
  return !isSeparatorParagraph(p);
}

export function hasValidParagraphTranslation(p: ParagraphCoverageInput): boolean {
  const text = (p.translatedText ?? '').trim();
  if (text.length === 0) return false;
  if (text.startsWith('❌') || isChunkError(text)) return false;
  return true;
}

export function getTranslationCoverage(paragraphs: ParagraphCoverageInput[]): TranslationCoverage {
  const contentParagraphs = paragraphs.filter(isContentParagraph);
  const missingParagraphIds: string[] = [];
  let translatedCount = 0;

  for (const p of contentParagraphs) {
    if (hasValidParagraphTranslation(p)) {
      translatedCount++;
    } else {
      missingParagraphIds.push(p.id);
    }
  }

  const contentTotal = contentParagraphs.length;
  return {
    contentTotal,
    translatedCount,
    isComplete: contentTotal === 0 || translatedCount >= contentTotal,
    missingParagraphIds,
  };
}

export type TranslationEditingPhase = 'none' | 'after_translate' | 'after_edit';

export function resolveChapterStatusAfterTranslation(opts: {
  paragraphs: ParagraphCoverageInput[];
  runEditing: boolean;
  editingPhase: TranslationEditingPhase;
}): 'completed' | 'draft' | 'partial' {
  const coverage = getTranslationCoverage(opts.paragraphs);
  if (!coverage.isComplete) {
    return 'partial';
  }
  if (opts.runEditing && opts.editingPhase === 'after_translate') {
    return 'draft';
  }
  return 'completed';
}

/** Chapter has any usable translation body (partial or full). */
export function chapterHasAnyTranslation(
  paragraphs: ParagraphCoverageInput[],
  status?: string
): boolean {
  if (status === 'completed' || status === 'draft' || status === 'partial') {
    return true;
  }
  return getTranslationCoverage(paragraphs).translatedCount > 0;
}

/** Fully translated: all content paragraphs covered (defensive vs stale status). */
export function chapterIsFullyTranslated(
  paragraphs: ParagraphCoverageInput[],
  status?: string,
  translatedParagraphCount?: number,
  paragraphCount?: number
): boolean {
  const coverage = getTranslationCoverage(paragraphs);
  if (paragraphs.length > 0) {
    return coverage.isComplete && coverage.translatedCount > 0;
  }
  if (
    typeof translatedParagraphCount === 'number' &&
    typeof paragraphCount === 'number' &&
    paragraphCount > 0
  ) {
    return translatedParagraphCount >= paragraphCount;
  }
  return status === 'completed';
}
