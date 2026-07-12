/**
 * Resolve chapter source text from chapter.originalText or paragraph fallback.
 */

import type { Chapter, Paragraph } from '../../../storage/database.js';
import { mergeParagraphsToText } from '../../../storage/database.js';

export function resolveEffectiveOriginalText(chapter: {
  originalText?: string;
  paragraphs?: Paragraph[];
}): string {
  if (chapter.originalText && chapter.originalText.trim().length > 0) {
    return chapter.originalText.trim();
  }
  if (chapter.paragraphs && chapter.paragraphs.length > 0) {
    return mergeParagraphsToText(chapter.paragraphs, 'originalText').trim();
  }
  return '';
}

export function chapterWithEffectiveOriginalText(chapter: Chapter): Chapter | null {
  const text = resolveEffectiveOriginalText(chapter);
  if (!text) return null;
  return { ...chapter, originalText: text };
}
