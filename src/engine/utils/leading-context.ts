/**
 * Rolling previous-paragraph context for chunked translation.
 */

import type { TextChunk } from '../types/common.js';

export function splitSourceParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

/**
 * Returns up to `count` source paragraphs immediately before the chunk's first paragraph.
 */
export function getLeadingParagraphsForChunk(
  allParagraphs: string[],
  chunk: TextChunk,
  count: number
): string[] {
  if (count <= 0 || allParagraphs.length === 0) return [];

  let startIdx = chunk.startParagraphIndex;
  if (startIdx == null || startIdx < 0) {
    const trimmed = chunk.content.trim();
    startIdx = allParagraphs.findIndex(
      (p) => trimmed.startsWith(p.trim()) || trimmed.includes(p.trim())
    );
  }
  if (startIdx <= 0) return [];

  const from = Math.max(0, startIdx - count);
  return allParagraphs.slice(from, startIdx);
}
