/**
 * TXT parser module
 * Simple text file parser (existing functionality)
 */

import type { ParseResult } from './types.js';

/**
 * Parse TXT file
 */
export async function parseText(fileBuffer: Buffer, filename: string): Promise<ParseResult> {
  const text = fileBuffer.toString('utf-8');

  // Extract title from filename (remove extension and numbers)
  const title = filename
    .replace(/\.txt$/i, '')
    .replace(/^\d+[._\-\s]*/, '')
    .trim() || 'Глава 1';

  // Split into chapters if there are clear separators
  // For now, treat entire file as one chapter
  const chapters = [
    {
      title,
      number: 1,
      content: text,
    },
  ];

  return {
    format: 'txt',
    metadata: {},
    chapters,
  };
}
