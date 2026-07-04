/**
 * Sync translated/edited text to chapter paragraphs by marker id or JSON rows.
 */

import { isChunkError } from './chunkErrors.js';
import {
  buildParagraphTranslationMap,
  detectSuspectTruncations,
} from './paragraphTranslationMap.js';
import type { Paragraph } from '../storage/types.js';
import { logger } from '../logger.js';

function isSeparatorParagraph(p: Paragraph): boolean {
  const text = p.originalText.trim();
  if (text.length === 0) return false;
  return /^[\s*\-_=~#]+$/.test(text);
}

function hasValidTranslation(p: Paragraph): boolean {
  const text = p.translatedText?.trim() || '';
  if (text.length === 0) return false;
  if (text.startsWith('❌') || isChunkError(text)) return false;
  return true;
}

function logMergedDuplicates(
  mergedDuplicates: Array<{ paragraphId: string; partsCount: number }>,
  context: string
): void {
  for (const { paragraphId, partsCount } of mergedDuplicates) {
    logger.warn(
      {
        event: 'paragraph_sync.duplicate_ids_merged',
        paragraphId,
        partsCount,
        context,
      },
      `Paragraph sync: merged ${partsCount} parts for duplicate id ${paragraphId}`
    );
  }
}

/**
 * Map parsed marker-based edits to paragraphs by id. Keeps separators and missing ids unchanged.
 */
export function syncEditedMarkersToParagraphs(
  originalParagraphs: Paragraph[],
  parsed: Array<{ id: string; text: string }>
): Paragraph[] {
  const { map: byId, mergedDuplicates } = buildParagraphTranslationMap(
    parsed.map((x) => ({ id: x.id, text: x.text }))
  );
  logMergedDuplicates(mergedDuplicates, 'marker');

  const now = new Date().toISOString();
  return originalParagraphs.map((p) => {
    if (isSeparatorParagraph(p)) return p;
    const text = byId.get(p.id);
    if (text === undefined) return p;
    return {
      ...p,
      translatedText: text,
      status: 'edited' as const,
      editedAt: now,
      editedBy: 'ai' as const,
    };
  });
}

/**
 * Sync translated JSON structure to paragraph structure by paragraph id.
 */
export function syncTranslationJSONToParagraphs(
  originalParagraphs: Paragraph[],
  translationJSON: { paragraphs: Array<{ id: string; translated: string }> },
  partialTranslation: boolean = false
): Paragraph[] {
  if (!originalParagraphs || originalParagraphs.length === 0) {
    logger.warn('syncTranslationJSONToParagraphs: no original paragraphs');
    return [];
  }

  if (!translationJSON?.paragraphs?.length) {
    logger.warn('syncTranslationJSONToParagraphs: no translated paragraphs in JSON');
    return originalParagraphs;
  }

  const now = new Date().toISOString();

  logger.debug(
    {
      originalCount: originalParagraphs.length,
      jsonParagraphsCount: translationJSON.paragraphs.length,
    },
    `JSON sync: ${originalParagraphs.length} original, ${translationJSON.paragraphs.length} translated paragraphs`
  );

  const { map: translationMap, mergedDuplicates } = buildParagraphTranslationMap(
    translationJSON.paragraphs.map((tp) => ({
      id: tp.id,
      text: tp.translated ?? '',
    }))
  );
  logMergedDuplicates(mergedDuplicates, 'json');

  logger.debug(
    { translationMapSize: translationMap.size },
    `Translation map created: ${translationMap.size} paragraphs`
  );

  const result = originalParagraphs.map((original) => {
    if (isSeparatorParagraph(original)) return original;
    if (partialTranslation && hasValidTranslation(original)) return original;

    const translation = translationMap.get(original.id);
    if (translation) {
      return {
        ...original,
        translatedText: translation,
        status: 'translated' as const,
        editedAt: now,
        editedBy: 'ai' as const,
      };
    }

    return original;
  });

  const translatedCount = result.filter((p) => hasValidTranslation(p)).length;
  const preservedCount = originalParagraphs.filter((p) => hasValidTranslation(p)).length;
  const newTranslations = translatedCount - preservedCount;
  const emptyCount = originalParagraphs.length - preservedCount;

  logger.debug(
    { translatedCount, total: originalParagraphs.length, preservedCount, newTranslations },
    `JSON sync done: ${translatedCount}/${originalParagraphs.length} paragraphs have translation`
  );

  if (newTranslations < emptyCount && !partialTranslation) {
    logger.warn(
      { newTranslations, emptyCount, missingCount: emptyCount - newTranslations },
      'Not all paragraphs received translation in JSON sync'
    );
  }

  if (translatedCount === 0 && translationJSON.paragraphs.length > 0 && !partialTranslation) {
    logger.error(
      {
        jsonParagraphsCount: translationJSON.paragraphs.length,
        translationMapSize: translationMap.size,
      },
      'Critical: entire translation lost during JSON sync'
    );
  }

  return result;
}

export function logSuspectTruncationsAfterSync(
  projectId: string,
  chapterId: string,
  paragraphs: Paragraph[]
): void {
  const suspects = detectSuspectTruncations(paragraphs);
  for (const s of suspects) {
    logger.warn(
      {
        event: 'translation.truncated_suspect',
        projectId,
        chapterId,
        paragraphId: s.paragraphId,
        originalLength: s.originalLength,
        translatedLength: s.translatedLength,
        ratio: s.ratio,
      },
      `Translation may be truncated for paragraph ${s.paragraphId} (${Math.round(s.ratio * 100)}% of source length)`
    );
  }
}
