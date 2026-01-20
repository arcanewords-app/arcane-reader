/**
 * Types for file import/parsing
 */

export type ImportFormat = 'txt' | 'epub' | 'fb2';

/**
 * Book metadata extracted from file
 */
export interface BookMetadata {
  title?: string;
  authors?: string[];
  language?: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  series?: string;
  seriesNumber?: number;
  coverImage?: {
    data: Buffer;
    mimeType: string;
  };
  publishedDate?: string;
}

/**
 * Parsed chapter from book file
 */
export interface ParsedChapter {
  title: string;
  number: number;
  content: string; // Plain text content
  htmlContent?: string; // HTML formatted content (for EPUB/FB2)
  originalStructure?: {
    // Preserve original structure for export
    type: 'paragraph' | 'heading' | 'list' | 'quote' | 'epigraph';
    level?: number; // For headings
    content: string;
  }[];
}

/**
 * Result of parsing a book file
 */
export interface ParseResult {
  format: ImportFormat;
  metadata: BookMetadata;
  chapters: ParsedChapter[];
  errors?: string[];
  warnings?: string[];
}
