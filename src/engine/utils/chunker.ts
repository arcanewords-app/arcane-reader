/**
 * Text Chunker - Splits text into manageable chunks for API processing
 */

import { createRequire } from 'node:module';
import type { TextChunk } from '../types/common.js';

const require = createRequire(import.meta.url);
import { log } from '../logger.js';

export interface ChunkerOptions {
  maxTokens: number; // Max tokens per chunk
  overlapSentences: number; // Sentences to overlap between chunks
  preserveParagraphs: boolean;
  /**
   * When true, never split a single paragraph into smaller chunks (e.g. by sentences).
   * Keeps 1:1 paragraph boundaries and reduces sync/merge errors. Oversized paragraphs
   * become one chunk (may exceed maxTokens; consider increasing timeout for such chunks).
   * Default true for translation/editing.
   */
  neverSplitParagraphs?: boolean;
}

/** Fallback when options omit a value. Should match app config MAX_TOKENS_PER_CHUNK (2000); pipeline passes config value. */
const DEFAULT_OPTIONS: ChunkerOptions = {
  maxTokens: 2000,
  overlapSentences: 2,
  preserveParagraphs: true,
  neverSplitParagraphs: true,
};

/** Lazy-loaded tiktoken encoder (cl100k_base for GPT-4). Sync init on first use. */
let tiktokenEncoder: { encode: (text: string) => number[] } | null = null;
let tiktokenInitDone = false;

function getTiktokenEncoder(): { encode: (text: string) => number[] } | null {
  if (tiktokenInitDone) return tiktokenEncoder;
  tiktokenInitDone = true;
  try {
    const mod = require('js-tiktoken');
    tiktokenEncoder = mod.getEncoding('cl100k_base');
  } catch {
    tiktokenEncoder = null;
  }
  return tiktokenEncoder;
}

/**
 * Improved heuristic: ~4 chars/token for Latin, ~1 char/token for CJK.
 * Used when tiktoken is unavailable.
 */
function estimateTokensHeuristic(text: string): number {
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      tokens += 1;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Estimate token count for text.
 * Uses tiktoken (cl100k_base) when available; falls back to CJK-aware heuristic.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  try {
    const enc = getTiktokenEncoder();
    if (enc) return enc.encode(text).length;
  } catch {
    /* fall through to heuristic */
  }
  return estimateTokensHeuristic(text);
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  const sentencePattern = /(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«])/g;
  return text.split(sentencePattern).filter((s) => s.trim().length > 0);
}

/**
 * Split text into paragraphs (content only, separators discarded)
 */
function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

/**
 * Split text into [content, separator][] pairs. Preserves the exact separator between paragraphs.
 * E.g. "a\n\nb\n\n\nc" -> [["a","\n\n"], ["b","\n\n\n"], ["c",""]]
 */
function splitIntoParagraphsWithSeparators(text: string): Array<{ content: string; separatorAfter: string }> {
  const parts = text.split(/(\n{2,})/);
  const result: Array<{ content: string; separatorAfter: string }> = [];
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i]?.trim() ?? '';
    const separatorAfter = (i + 1 < parts.length ? parts[i + 1] : '') ?? '';
    if (content.length > 0) {
      result.push({ content, separatorAfter });
    }
  }
  return result;
}

/**
 * Chunk text for API processing
 */
export function chunkText(text: string, options: Partial<ChunkerOptions> = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.preserveParagraphs) {
    return chunkByParagraphs(text, opts);
  }

  return chunkBySentences(text, opts);
}

/**
 * Chunk by paragraphs, keeping paragraphs together when possible.
 * Preserves original separators between chunks for accurate merge.
 */
function chunkByParagraphs(text: string, opts: ChunkerOptions): TextChunk[] {
  const parts = splitIntoParagraphsWithSeparators(text);
  if (parts.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let lastSeparator = '\n\n'; // default between chunks
  let chunkIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    const { content: paragraph, separatorAfter } = parts[i];
    const paragraphTokens = estimateTokens(paragraph);
    const currentTokens = estimateTokens(currentChunk);

    // If single paragraph exceeds limit: either keep as one chunk or split by sentences
    if (paragraphTokens > opts.maxTokens) {
      // Save current chunk if not empty
      if (currentChunk.trim()) {
        chunks.push(createChunk(currentChunk, chunkIndex++, lastSeparator));
        currentChunk = '';
      }

      if (opts.neverSplitParagraphs !== false) {
        // Keep paragraph whole to preserve structure and reduce sync errors (1:1 mapping)
        log.warn(
          'Chunker: paragraph exceeds maxTokens; keeping as single chunk (neverSplitParagraphs)',
          { paragraphTokens, maxTokens: opts.maxTokens }
        );
        chunks.push(createChunk(paragraph, chunkIndex++, separatorAfter));
      } else {
        // Legacy: split large paragraph into sentence-based chunks (no separator preservation)
        const sentenceChunks = chunkBySentences(paragraph, opts);
        for (let j = 0; j < sentenceChunks.length; j++) {
          const sep = j < sentenceChunks.length - 1 ? '\n\n' : separatorAfter;
          chunks.push(createChunk(sentenceChunks[j].content, chunkIndex++, sep));
        }
      }
      lastSeparator = separatorAfter || '\n\n';
      continue;
    }

    // If adding paragraph exceeds limit, start new chunk
    if (currentTokens + paragraphTokens > opts.maxTokens && currentChunk.trim()) {
      chunks.push(createChunk(currentChunk, chunkIndex++, lastSeparator));
      currentChunk = paragraph;
      lastSeparator = separatorAfter || '\n\n';
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      lastSeparator = separatorAfter || '\n\n';
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(createChunk(currentChunk, chunkIndex, lastSeparator));
  }

  return chunks;
}

/**
 * Chunk by sentences with overlap
 */
function chunkBySentences(text: string, opts: ChunkerOptions): TextChunk[] {
  const sentences = splitIntoSentences(text);
  const chunks: TextChunk[] = [];

  let currentSentences: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > opts.maxTokens && currentSentences.length > 0) {
      // Create chunk from current sentences
      chunks.push(createChunk(currentSentences.join(' '), chunkIndex++));

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentSentences.length - opts.overlapSentences);
      currentSentences = currentSentences.slice(overlapStart);
      currentTokens = estimateTokens(currentSentences.join(' '));
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Last chunk
  if (currentSentences.length > 0) {
    chunks.push(createChunk(currentSentences.join(' '), chunkIndex));
  }

  return chunks;
}

function createChunk(content: string, index: number, separatorAfter?: string): TextChunk {
  return {
    id: `chunk_${index}`,
    content: content.trim(),
    index,
    tokenCount: estimateTokens(content),
    ...(separatorAfter !== undefined && separatorAfter !== '' && { separatorAfter }),
  };
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

/**
 * Split chapter into logical sections (for very long chapters)
 */
export function splitIntoSections(text: string, maxSectionTokens: number = 8000): string[] {
  const paragraphs = splitIntoParagraphs(text);
  const sections: string[] = [];

  let currentSection = '';

  for (const paragraph of paragraphs) {
    const combined = currentSection + '\n\n' + paragraph;

    if (estimateTokens(combined) > maxSectionTokens && currentSection) {
      sections.push(currentSection.trim());
      currentSection = paragraph;
    } else {
      currentSection = combined;
    }
  }

  if (currentSection.trim()) {
    sections.push(currentSection.trim());
  }

  return sections;
}
