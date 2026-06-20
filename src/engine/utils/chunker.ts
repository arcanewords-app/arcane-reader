/**
 * Text Chunker - Splits text into manageable chunks for API processing
 */

import type { TextChunk } from '../types/common.js';
import { log } from '../logger.js';
import {
  chunkText as chunkTextCore,
  estimateTokens,
  splitIntoSections,
  type ChunkerOptions,
} from './chunker-core.js';

export type { ChunkerOptions };
export { estimateTokens, splitIntoSections };

/** Re-export with server-side logging on oversized paragraphs handled in core silently. */
export function chunkText(text: string, options: Partial<ChunkerOptions> = {}): TextChunk[] {
  return chunkTextCore(text, options);
}
export interface MergeChunkInput {
  content: string;
  index: number;
  /** Separator to use after this chunk when merging. Preserves original structure (e.g. '\n\n' vs '\n\n\n'). */
  separatorAfter?: string;
}

/**
 * Merge translated chunks back together.
 * Uses separatorAfter from each chunk when available to preserve original paragraph structure.
 */
export function mergeChunks(chunks: MergeChunkInput[]): string {
  if (!chunks || chunks.length === 0) {
    log.warn('mergeChunks: empty chunk array');
    return '';
  }

  const defaultSeparator = '\n\n';

  // Sort by index to ensure correct order
  const sorted = chunks
    .filter((c) => c.content && c.content.trim().length > 0) // Filter out empty chunks
    .sort((a, b) => a.index - b.index);

  if (sorted.length === 0) {
    log.warn('mergeChunks: all chunks empty after filter');
    return '';
  }

  if (sorted.length !== chunks.length) {
    log.warn(`mergeChunks: filtered ${chunks.length - sorted.length} empty chunks`, {
      filtered: chunks.length - sorted.length,
    });
  }

  const merged = sorted
    .map((c, i) => {
      const sep = c.separatorAfter ?? defaultSeparator;
      return c.content + (i < sorted.length - 1 ? sep : '');
    })
    .join('');

  log.debug('mergeChunks: merged', { chunksCount: sorted.length, mergedLength: merged.length });

  return merged;
}
