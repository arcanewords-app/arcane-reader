/**
 * Text Chunker - Splits text into manageable chunks for API processing
 */

import type { TextChunk } from '../types/common.js';

export interface ChunkerOptions {
  maxTokens: number;        // Max tokens per chunk
  overlapSentences: number; // Sentences to overlap between chunks
  preserveParagraphs: boolean;
}

const DEFAULT_OPTIONS: ChunkerOptions = {
  maxTokens: 2000,
  overlapSentences: 2,
  preserveParagraphs: true,
};

/**
 * Estimate token count for text (rough approximation for English)
 */
export function estimateTokens(text: string): number {
  // Rough: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  const sentencePattern = /(?<=[.!?])\s+(?=[A-ZА-ЯЁ"«])/g;
  return text.split(sentencePattern).filter(s => s.trim().length > 0);
}

/**
 * Split text into paragraphs
 */
function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

/**
 * Chunk text for API processing
 */
export function chunkText(
  text: string,
  options: Partial<ChunkerOptions> = {}
): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: TextChunk[] = [];
  
  if (opts.preserveParagraphs) {
    return chunkByParagraphs(text, opts);
  }
  
  return chunkBySentences(text, opts);
}

/**
 * Chunk by paragraphs, keeping paragraphs together when possible
 */
function chunkByParagraphs(text: string, opts: ChunkerOptions): TextChunk[] {
  const paragraphs = splitIntoParagraphs(text);
  const chunks: TextChunk[] = [];
  
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    const currentTokens = estimateTokens(currentChunk);
    
    // If single paragraph exceeds limit, split it by sentences
    if (paragraphTokens > opts.maxTokens) {
      // Save current chunk if not empty
      if (currentChunk.trim()) {
        chunks.push(createChunk(currentChunk, chunkIndex++));
        currentChunk = '';
      }
      
      // Split large paragraph into sentence-based chunks
      const sentenceChunks = chunkBySentences(paragraph, opts);
      for (const sc of sentenceChunks) {
        chunks.push(createChunk(sc.content, chunkIndex++));
      }
      continue;
    }
    
    // If adding paragraph exceeds limit, start new chunk
    if (currentTokens + paragraphTokens > opts.maxTokens && currentChunk.trim()) {
      chunks.push(createChunk(currentChunk, chunkIndex++));
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(createChunk(currentChunk, chunkIndex));
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

function createChunk(content: string, index: number): TextChunk {
  return {
    id: `chunk_${index}`,
    content: content.trim(),
    index,
    tokenCount: estimateTokens(content),
  };
}

/**
 * Merge translated chunks back together
 */
export function mergeChunks(chunks: { content: string; index: number }[]): string {
  if (!chunks || chunks.length === 0) {
    console.warn('[mergeChunks] Пустой массив чанков для объединения');
    return '';
  }

  // Sort by index to ensure correct order
  const sorted = chunks
    .filter(c => c.content && c.content.trim().length > 0) // Filter out empty chunks
    .sort((a, b) => a.index - b.index);

  if (sorted.length === 0) {
    console.warn('[mergeChunks] Все чанки пусты после фильтрации');
    return '';
  }

  if (sorted.length !== chunks.length) {
    console.warn(`[mergeChunks] Отфильтровано ${chunks.length - sorted.length} пустых чанков`);
  }

  const merged = sorted.map(c => c.content).join('\n\n');
  
  console.log(`[mergeChunks] Объединено ${sorted.length} чанков в текст длиной ${merged.length} символов`);
  
  return merged;
}

/**
 * Split chapter into logical sections (for very long chapters)
 */
export function splitIntoSections(
  text: string,
  maxSectionTokens: number = 8000
): string[] {
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

