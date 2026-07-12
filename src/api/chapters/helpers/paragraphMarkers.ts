/**
 * Paragraph marker helpers for chapter translation pipeline.
 */

import type { Paragraph } from '../../../storage/database.js';
import {
  PARA_MARKER_PREFIX,
  PARA_MARKER_SUFFIX,
  parseParagraphMarkers,
} from '../../../engine/utils/para-markers.js';

export { parseParagraphMarkers as parseEditedTextByMarkers };

/**
 * Add --para:{id}-- markers to double-newline-separated text, matching DB paragraphs by originalText.
 */
export function addParagraphMarkersToText(text: string, paragraphs: Paragraph[]): string {
  const textParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let paraIndex = 0;
  const markedParagraphs: string[] = [];

  for (const textPara of textParagraphs) {
    let matchedPara: Paragraph | undefined;

    if (paraIndex < paragraphs.length) {
      if (paragraphs[paraIndex].originalText.trim() === textPara) {
        matchedPara = paragraphs[paraIndex];
        paraIndex++;
      } else {
        for (let i = 0; i < paragraphs.length; i++) {
          if (paragraphs[i].originalText.trim() === textPara) {
            matchedPara = paragraphs[i];
            paraIndex = i + 1;
            break;
          }
        }
      }
    }

    if (matchedPara) {
      markedParagraphs.push(
        `${PARA_MARKER_PREFIX}${matchedPara.id}${PARA_MARKER_SUFFIX}${textPara}`
      );
    } else {
      markedParagraphs.push(
        `${PARA_MARKER_PREFIX}auto_${markedParagraphs.length}${PARA_MARKER_SUFFIX}${textPara}`
      );
    }
  }

  return markedParagraphs.join('\n\n');
}

/**
 * Build marked text from paragraph translated/original bodies for editing stage input.
 */
export function buildMarkedTextFromParagraphs(paragraphs: Paragraph[]): string {
  if (!paragraphs?.length) return '';
  const sorted = [...paragraphs].sort((a, b) => a.index - b.index);
  return sorted
    .map((p) => {
      const text = (p.translatedText ?? p.originalText ?? '').trim();
      return `${PARA_MARKER_PREFIX}${p.id}${PARA_MARKER_SUFFIX}${text}`;
    })
    .join('\n\n');
}
