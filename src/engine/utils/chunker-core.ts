/**
 * Browser-safe text chunker (no Node logger / async_hooks).
 * Used by Prompt Lab execution preview; server chunker.ts re-exports and adds logging.
 */

import { getEncoding } from 'js-tiktoken';
import type { TextChunk } from '../types/common.js';
import { estimateTokensHeuristic } from './token-estimate.js';

export interface ChunkerOptions {
  maxTokens: number;
  overlapSentences: number;
  preserveParagraphs: boolean;
  neverSplitParagraphs?: boolean;
}

const DEFAULT_OPTIONS: ChunkerOptions = {
  maxTokens: 3000,
  overlapSentences: 2,
  preserveParagraphs: true,
  neverSplitParagraphs: true,
};

let tiktokenEncoder: { encode: (text: string) => number[] } | null | undefined;

function getTiktokenEncoder(): { encode: (text: string) => number[] } | null {
  if (tiktokenEncoder !== undefined) return tiktokenEncoder;
  try {
    tiktokenEncoder = getEncoding('cl100k_base');
  } catch {
    tiktokenEncoder = null;
  }
  return tiktokenEncoder;
}

export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  try {
    const enc = getTiktokenEncoder();
    if (enc) return enc.encode(text).length;
  } catch {
    /* fall through */
  }
  return estimateTokensHeuristic(text);
}

function splitIntoSentences(text: string): string[] {
  const sentencePattern = /(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«])/g;
  return text.split(sentencePattern).filter((s) => s.trim().length > 0);
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

function splitIntoParagraphsWithSeparators(
  text: string
): Array<{ content: string; separatorAfter: string }> {
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

export function chunkText(text: string, options: Partial<ChunkerOptions> = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (opts.preserveParagraphs) {
    return chunkByParagraphs(text, opts);
  }
  return chunkBySentences(text, opts);
}

function chunkByParagraphs(text: string, opts: ChunkerOptions): TextChunk[] {
  const parts = splitIntoParagraphsWithSeparators(text);
  if (parts.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let lastSeparator = '\n\n';
  let chunkIndex = 0;
  let chunkStartParaIdx: number | undefined;
  let chunkEndParaIdx: number | undefined;

  const flushChunk = (separatorAfter?: string) => {
    if (!currentChunk.trim()) return;
    chunks.push(
      createChunk(currentChunk, chunkIndex++, separatorAfter, chunkStartParaIdx, chunkEndParaIdx)
    );
    currentChunk = '';
    chunkStartParaIdx = undefined;
    chunkEndParaIdx = undefined;
  };

  for (let i = 0; i < parts.length; i++) {
    const { content: paragraph, separatorAfter } = parts[i];
    const paragraphTokens = estimateTokens(paragraph);
    const currentTokens = estimateTokens(currentChunk);

    if (paragraphTokens > opts.maxTokens) {
      flushChunk(lastSeparator);

      if (opts.neverSplitParagraphs !== false) {
        chunks.push(createChunk(paragraph, chunkIndex++, separatorAfter, i, i));
      } else {
        const sentenceChunks = chunkBySentences(paragraph, opts);
        for (let j = 0; j < sentenceChunks.length; j++) {
          const sep = j < sentenceChunks.length - 1 ? '\n\n' : separatorAfter;
          chunks.push(createChunk(sentenceChunks[j].content, chunkIndex++, sep));
        }
      }
      lastSeparator = separatorAfter || '\n\n';
      continue;
    }

    if (currentTokens + paragraphTokens > opts.maxTokens && currentChunk.trim()) {
      flushChunk(lastSeparator);
      currentChunk = paragraph;
      chunkStartParaIdx = i;
      chunkEndParaIdx = i;
      lastSeparator = separatorAfter || '\n\n';
    } else {
      if (!currentChunk.trim()) {
        chunkStartParaIdx = i;
      }
      chunkEndParaIdx = i;
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      lastSeparator = separatorAfter || '\n\n';
    }
  }

  flushChunk(lastSeparator);
  return chunks;
}

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
      chunks.push(createChunk(currentSentences.join(' '), chunkIndex++));
      const overlapStart = Math.max(0, currentSentences.length - opts.overlapSentences);
      currentSentences = currentSentences.slice(overlapStart);
      currentTokens = estimateTokens(currentSentences.join(' '));
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentSentences.length > 0) {
    chunks.push(createChunk(currentSentences.join(' '), chunkIndex));
  }

  return chunks;
}

function createChunk(
  content: string,
  index: number,
  separatorAfter?: string,
  startParagraphIndex?: number,
  endParagraphIndex?: number
): TextChunk {
  return {
    id: `chunk_${index}`,
    content: content.trim(),
    index,
    tokenCount: estimateTokens(content),
    ...(separatorAfter !== undefined && separatorAfter !== '' && { separatorAfter }),
    ...(startParagraphIndex !== undefined && { startParagraphIndex }),
    ...(endParagraphIndex !== undefined && { endParagraphIndex }),
  };
}

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
