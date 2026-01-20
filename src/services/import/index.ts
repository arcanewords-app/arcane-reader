/**
 * Universal file import service
 * Detects file format and routes to appropriate parser
 */

import type { ParseResult } from './types.js';
import { parseEpub } from './epub.js';
import { parseFb2 } from './fb2.js';
import { parseText } from './txt.js';
import { getProjectTypeFromFormat } from './project-type.js';

export type { ParseResult, BookMetadata, ParsedChapter, ImportFormat } from './types.js';
export { getProjectTypeFromFormat, supportsMetadata, supportsCoverImage, getProjectTypeDisplayName, getProjectTypeIcon, getProjectTypeColor } from './project-type.js';

/**
 * Parse file based on extension and content
 */
export async function parseFile(
  fileBuffer: Buffer,
  filename: string
): Promise<ParseResult> {
  const extension = filename.toLowerCase().split('.').pop() || '';

  switch (extension) {
    case 'epub':
      return await parseEpub(fileBuffer);
    case 'fb2':
      return await parseFb2(fileBuffer);
    case 'txt':
      return await parseText(fileBuffer, filename);
    default:
      throw new Error(`Неподдерживаемый формат файла: .${extension}`);
  }
}

/**
 * Check if file format is supported
 */
export function isSupportedFormat(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop() || '';
  return ['txt', 'epub', 'fb2'].includes(extension);
}
