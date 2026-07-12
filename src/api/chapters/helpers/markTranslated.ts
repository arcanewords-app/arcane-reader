/**
 * Mark-as-translated paragraph mapping — extracted from chapters routes.
 */

import type { Paragraph } from '../../../storage/database.js';
import { mergeParagraphsToText } from '../../../storage/database.js';

export function buildMarkTranslatedParagraphs(
  paragraphs: Paragraph[],
  now = new Date().toISOString()
): {
  updatedParagraphs: Paragraph[];
  mergedText: string;
  chunks: string[];
} {
  const updatedParagraphs = paragraphs.map((p) => ({
    ...p,
    translatedText: p.originalText,
    status: 'translated' as const,
    editedBy: 'user' as const,
    editedAt: now,
  }));

  const mergedText = mergeParagraphsToText(updatedParagraphs, 'translatedText');
  const chunks = [...updatedParagraphs]
    .sort((a, b) => a.index - b.index)
    .map((p) => p.translatedText || '');

  return { updatedParagraphs, mergedText, chunks };
}
