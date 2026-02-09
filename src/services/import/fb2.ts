/**
 * FB2 (FictionBook 2.0) parser module
 * Extracts metadata, chapters, and content from FB2 XML files
 */

import { XMLParser } from 'fast-xml-parser';
import type { BookMetadata, ParsedChapter, ParseResult } from './types.js';

/**
 * Parse FB2 file
 */
export async function parseFb2(fileBuffer: Buffer): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata: BookMetadata = {};
  const chapters: ParsedChapter[] = [];

  try {
    const xmlText = fileBuffer.toString('utf-8');

    // Configure XML parser
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
    });

    const fb2 = parser.parse(xmlText);

    // Check if it's a valid FB2 file
    if (!fb2.FictionBook) {
      errors.push('Неверный формат FB2 файла');
      return {
        format: 'fb2',
        metadata,
        chapters: [],
        errors,
      };
    }

    const fictionBook = fb2.FictionBook;
    const description = fictionBook.description;

    // Extract metadata from description/title-info
    if (description?.['title-info']) {
      const titleInfo = description['title-info'];

      metadata.title = extractText(titleInfo['book-title']);
      metadata.language = titleInfo.lang || undefined;

      // Extract authors
      const authors = titleInfo.author;
      if (authors) {
        const authorsList = Array.isArray(authors) ? authors : [authors];
        metadata.authors = authorsList.map((author: Record<string, unknown>) => {
          const firstName = extractText(author['first-name']);
          const middleName = extractText(author['middle-name']);
          const lastName = extractText(author['last-name']);
          const nickname = extractText(author.nickname);
          return (
            nickname || [firstName, middleName, lastName].filter(Boolean).join(' ') || 'Unknown'
          );
        });
      }

      // Extract other metadata
      metadata.publisher = extractText(titleInfo.publisher);
      metadata.description = extractText(titleInfo.annotation);
      metadata.isbn = extractText(titleInfo['isbn']);

      // Extract series info
      const sequence = titleInfo.sequence;
      if (sequence) {
        const seqList = Array.isArray(sequence) ? sequence : [sequence];
        const firstSeq = seqList[0];
        if (firstSeq) {
          metadata.series = extractText(firstSeq['@_name']);
          metadata.seriesNumber = firstSeq['@_number']
            ? parseInt(firstSeq['@_number'], 10)
            : undefined;
        }
      }
    }

    // Extract document info
    if (description?.['document-info']) {
      const docInfo = description['document-info'];
      const date = docInfo.date;
      if (date) {
        metadata.publishedDate = extractText(date.value || date);
      }
    }

    // Extract cover image if available
    try {
      const coverpage = description?.['title-info']?.coverpage;
      if (coverpage) {
        const imageHref = coverpage.image?.['@_l:href'] || coverpage.image?.['@_href'];
        if (imageHref && imageHref.startsWith('#')) {
          const imageId = imageHref.substring(1);
          const binary = fictionBook.binary;
          if (binary) {
            const binaries = Array.isArray(binary) ? binary : [binary];
            const coverBinary = binaries.find(
              (b: Record<string, unknown>) =>
                (b['@_id'] as string) === imageId ||
                (b['@_id'] as string) === imageId.replace('#', '')
            );
            if (coverBinary) {
              const imageData = Buffer.from(coverBinary['#text'], 'base64');
              const contentType = coverBinary['@_content-type'] || 'image/jpeg';
              metadata.coverImage = {
                data: imageData,
                mimeType: contentType,
              };
            }
          }
        }
      }
    } catch (coverError) {
      warnings.push('Не удалось извлечь обложку');
    }

    // Extract chapters from body/sections
    const body = fictionBook.body;
    if (!body) {
      errors.push('FB2 файл не содержит тела книги');
      return {
        format: 'fb2',
        metadata,
        chapters: [],
        errors,
        warnings,
      };
    }

    // Extract sections (chapters)
    const sections = extractSections(body);
    if (sections.length === 0) {
      errors.push('FB2 файл не содержит глав');
      return {
        format: 'fb2',
        metadata,
        chapters: [],
        errors,
        warnings,
      };
    }

    // Convert sections to chapters
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const title = extractTitle(section.title) || `Глава ${i + 1}`;
      const content = extractSectionContent(section);
      const htmlContent = extractSectionHtml(section);

      chapters.push({
        title,
        number: i + 1,
        content,
        htmlContent,
      });
    }

    if (chapters.length === 0) {
      errors.push('Не удалось извлечь ни одной главы из FB2 файла');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Ошибка парсинга FB2: ${errorMsg}`);
  }

  return {
    format: 'fb2',
    metadata,
    chapters,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Extract text from FB2 text node (can be string or object with #text)
 */
function extractText(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === 'string') return node;
  const n = node as Record<string, unknown>;
  if (n['#text']) return String(n['#text']);
  if (n.p) {
    const paragraphs = Array.isArray(n.p) ? n.p : [n.p];
    return paragraphs
      .map((p: unknown) => extractText(p))
      .filter(Boolean)
      .join('\n\n');
  }
  return undefined;
}

/**
 * Extract title from title element
 */
function extractTitle(titleNode: unknown): string | undefined {
  if (!titleNode) return undefined;
  if (typeof titleNode === 'string') return titleNode;
  const t = titleNode as Record<string, unknown>;
  if (t.p) return extractText(t.p);
  return extractText(titleNode);
}

/**
 * Extract sections recursively from body
 */
function extractSections(body: Record<string, unknown>): Record<string, unknown>[] {
  const sections: Record<string, unknown>[] = [];

  if (body.section) {
    const sectionList = Array.isArray(body.section) ? body.section : [body.section];
    for (const section of sectionList) {
      sections.push(section);
      // Recursively extract nested sections
      if (section.section) {
        sections.push(...extractSections(section));
      }
    }
  }

  return sections;
}

/**
 * Extract plain text content from section
 */
function extractSectionContent(section: Record<string, unknown>): string {
  const paragraphs: string[] = [];

  // Extract paragraphs
  if (section.p) {
    const pList = Array.isArray(section.p) ? section.p : [section.p];
    for (const p of pList) {
      const text = extractParagraphText(p);
      if (text) paragraphs.push(text);
    }
  }

  // Extract nested sections
  if (section.section) {
    const nestedSections = Array.isArray(section.section) ? section.section : [section.section];
    for (const nested of nestedSections) {
      const nestedContent = extractSectionContent(nested);
      if (nestedContent) paragraphs.push(nestedContent);
    }
  }

  return paragraphs.join('\n\n');
}

/**
 * Extract HTML content from section (preserves structure)
 */
function extractSectionHtml(section: Record<string, unknown>): string {
  const htmlParts: string[] = [];

  // Extract paragraphs
  if (section.p) {
    const pList = Array.isArray(section.p) ? section.p : [section.p];
    for (const p of pList) {
      const html = extractParagraphHtml(p);
      if (html) htmlParts.push(`<p>${html}</p>`);
    }
  }

  // Extract nested sections
  if (section.section) {
    const nestedSections = Array.isArray(section.section) ? section.section : [section.section];
    for (const nested of nestedSections) {
      const nestedHtml = extractSectionHtml(nested);
      if (nestedHtml) htmlParts.push(nestedHtml);
    }
  }

  return htmlParts.join('\n');
}

/**
 * Extract plain text from paragraph element
 */
function extractParagraphText(p: unknown): string {
  if (typeof p === 'string') return p;
  const rec = p as Record<string, unknown>;
  if (rec['#text']) return String(rec['#text']);

  // Handle inline elements
  const parts: string[] = [];
  if (typeof rec === 'object' && rec !== null) {
    for (const key in rec) {
      if (key === '#text') {
        parts.push(String(rec[key]));
      } else if (key.startsWith('@_')) {
        continue;
      } else {
        const child = rec[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            parts.push(extractParagraphText(item));
          }
        } else {
          parts.push(extractParagraphText(child));
        }
      }
    }
  }

  return parts.filter(Boolean).join('');
}

/**
 * Extract HTML from paragraph element (preserves formatting)
 */
function extractParagraphHtml(p: unknown): string {
  if (typeof p === 'string') return escapeHtml(p);
  const rec = p as Record<string, unknown>;
  if (rec['#text']) return escapeHtml(String(rec['#text']));

  const parts: string[] = [];
  if (typeof rec === 'object' && rec !== null) {
    for (const key in rec) {
      if (key === '#text') {
        parts.push(escapeHtml(String(rec[key])));
      } else if (key.startsWith('@_')) {
        continue;
      } else {
        const child = rec[key];
        const tag = key === 'strong' ? 'strong' : key === 'emphasis' ? 'em' : 'span';
        if (Array.isArray(child)) {
          for (const item of child) {
            parts.push(`<${tag}>${extractParagraphHtml(item)}</${tag}>`);
          }
        } else {
          parts.push(`<${tag}>${extractParagraphHtml(child)}</${tag}>`);
        }
      }
    }
  }

  return parts.filter(Boolean).join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
