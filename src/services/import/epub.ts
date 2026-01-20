/**
 * EPUB parser module
 * Extracts metadata, chapters, and content from EPUB files
 */

import { EPub } from 'epub2';
import type { BookMetadata, ParsedChapter, ParseResult } from './types.js';

/**
 * Parse EPUB file
 */
export async function parseEpub(fileBuffer: Buffer): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata: BookMetadata = {};
  const chapters: ParsedChapter[] = [];

  try {
    // Create EPub instance from buffer
    // epub2 library expects a file path or buffer, but we need to handle it differently
    // Since we have a buffer, we'll need to use a temporary approach
    // Note: epub2 may require file path, so we'll handle buffer conversion
    const epub = new EPub(fileBuffer as any);

    // Wait for metadata to be parsed
    await new Promise<void>((resolve, reject) => {
      epub.on('end', () => resolve());
      epub.on('error', (err) => reject(err));
    });

    // Extract metadata
    metadata.title = epub.metadata?.title || undefined;
    const creator = epub.metadata?.creator;
    if (creator) {
      metadata.authors = Array.isArray(creator) ? creator : [creator];
    }
    metadata.language = epub.metadata?.language || undefined;
    metadata.publisher = epub.metadata?.publisher || undefined;
    metadata.description = epub.metadata?.description || undefined;
    metadata.isbn = epub.metadata?.identifier || undefined;
    metadata.publishedDate = epub.metadata?.date || undefined;

    // Extract cover image if available
    try {
      const coverId = epub.metadata?.cover;
      if (coverId) {
        await new Promise<void>((resolve, reject) => {
          epub.getImage(coverId, (err: Error | null, img?: Buffer, mimeType?: string) => {
            if (err) {
              reject(err);
            } else if (img) {
              metadata.coverImage = {
                data: img,
                mimeType: mimeType || 'image/jpeg',
              };
              resolve();
            } else {
              resolve();
            }
          });
        });
      }
    } catch (coverError) {
      warnings.push('Не удалось извлечь обложку');
    }

    // Get table of contents (spine)
    const spine = epub.flow;
    if (!spine || spine.length === 0) {
      errors.push('EPUB файл не содержит глав');
      return {
        format: 'epub',
        metadata,
        chapters: [],
        errors,
        warnings,
      };
    }

    // Parse each chapter
    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      if (!item.id) {
        warnings.push(`Глава ${i + 1} не имеет ID`);
        continue;
      }
      try {
        const chapterText = await new Promise<string>((resolve, reject) => {
          epub.getChapter(item.id!, (err: Error | null, text?: string) => {
            if (err) {
              reject(err);
            } else {
              resolve(text || '');
            }
          });
        });

        if (!chapterText || chapterText.trim().length === 0) {
          warnings.push(`Глава ${i + 1} пуста или не может быть прочитана`);
          continue;
        }

        // Extract title from TOC or use default
        const tocItem = epub.toc?.find((t: any) => t.href === item.href);
        const title = tocItem?.title || `Глава ${i + 1}`;

        // Convert HTML to plain text and preserve HTML
        const plainText = htmlToPlainText(chapterText);
        const htmlContent = chapterText;

        chapters.push({
          title,
          number: i + 1,
          content: plainText,
          htmlContent,
        });
      } catch (chapterError) {
        const errorMsg =
          chapterError instanceof Error ? chapterError.message : 'Unknown error';
        errors.push(`Ошибка при парсинге главы ${i + 1}: ${errorMsg}`);
      }
    }

    if (chapters.length === 0) {
      errors.push('Не удалось извлечь ни одной главы из EPUB файла');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Ошибка парсинга EPUB: ${errorMsg}`);
  }

  return {
    format: 'epub',
    metadata,
    chapters,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Convert HTML to plain text
 * Removes HTML tags and converts entities
 */
function htmlToPlainText(html: string): string {
  // Remove script and style tags with content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Convert block elements to double newlines
  text = text.replace(/<\/?(p|div|h[1-6]|li|br)[^>]*>/gi, '\n\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single
    .trim();

  return text;
}
