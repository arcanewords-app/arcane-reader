/**
 * Auto-sync translated chunks to paragraphs — extracted from supabaseDatabase for unit testing.
 */

import { isChunkError } from '../../../shared/chunkErrors.js';
import type { Paragraph } from '../../../storage/database.js';

/**
 * Simplified chunk→paragraph sync for recovery paths in getChapter.
 */
export function autoSyncChunksToParagraphs(
  originalParagraphs: Paragraph[],
  translatedChunks: string[]
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    return [];
  }

  if (!translatedChunks || translatedChunks.length === 0) {
    return originalParagraphs;
  }

  const now = new Date().toISOString();

  const isSeparatorParagraph = (p: Paragraph): boolean => {
    const text = p.originalText.trim();
    if (text.length === 0) return false;
    const separatorPattern = /^[\s*\-_=~#]+$/;
    return separatorPattern.test(text);
  };

  const hasValidTranslation = (p: Paragraph): boolean => {
    const text = p.translatedText?.trim() || '';
    if (text.length === 0) return false;
    if (text.startsWith('❌') || isChunkError(text)) return false;
    return true;
  };

  let translationIndex = 0;

  return originalParagraphs.map((original) => {
    if (isSeparatorParagraph(original)) {
      return original;
    }

    if (hasValidTranslation(original)) {
      return original;
    }

    if (translationIndex < translatedChunks.length) {
      const translatedChunk = translatedChunks[translationIndex];
      translationIndex++;

      if (translatedChunk && translatedChunk.trim().length > 0) {
        return {
          ...original,
          translatedText: translatedChunk,
          status: 'translated' as const,
          editedAt: now,
          editedBy: 'ai' as const,
        };
      }
    }

    return original;
  });
}
