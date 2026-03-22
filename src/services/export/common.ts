/**
 * Common export utilities
 * Shared logic for EPUB and FB2 export
 */

import type { Project, Chapter } from '../../storage/database.js';
import type { TextBlockType } from '../../engine/types/common.js';
import { mergeParagraphsToText } from '../../storage/database.js';
import {
  convertMarkersToHtml,
  mergeSegmentsWithUnclosedBlocks,
} from '../../engine/utils/text-blocks.js';

/**
 * Export chapter data structure
 */
export interface ExportChapter {
  title: string;
  number: number;
  htmlContent: string; // HTML formatted content
  textContent: string; // Plain text content (may contain block markers for FB2)
}

/**
 * Export project data structure
 */
export interface ExportProject {
  title: string;
  author?: string;
  language: string;
  chapters: ExportChapter[];
  textBlockTypes?: TextBlockType[];
  metadata?: {
    translatedAt?: string;
    model?: string;
    totalChapters: number;
  };
}

/**
 * Convert plain text to HTML
 * Replaces paragraphs (double newlines) with <p> tags
 */
export function textToHtml(text: string, includeTitle: boolean = false, title?: string): string {
  if (!text || text.trim().length === 0) {
    return '<p></p>';
  }

  // Escape HTML special characters
  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Split into paragraphs (double newlines)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Convert paragraphs to <p> tags
  const htmlParagraphs = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');

  // Add title if needed
  if (includeTitle && title) {
    return `<h1>${escapeHtml(title)}</h1>\n${htmlParagraphs}`;
  }

  return htmlParagraphs;
}

/** Block-level HTML tags that should not be wrapped in <p> */
const BLOCK_TAGS = /^<(div|section|article|aside|blockquote)(\s|>)/i;

/**
 * Convert plain text to HTML with text block markers converted to HTML.
 * Uses convertMarkersToHtml for each paragraph segment.
 */
export function textToHtmlWithBlocks(
  text: string,
  blockTypes: TextBlockType[],
  includeTitle: boolean = false,
  title?: string
): string {
  if (!text || text.trim().length === 0) {
    return '<p></p>';
  }

  const enabledTypes = blockTypes.filter((bt) => bt.enabled);
  if (enabledTypes.length === 0 || !text.includes('{{block:')) {
    return textToHtml(text, includeTitle, title);
  }

  const segments = mergeSegmentsWithUnclosedBlocks(text, /\n\s*\n/);

  const parts: string[] = [];
  if (includeTitle && title) {
    const escapeHtml = (str: string): string =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    parts.push(`<h1>${escapeHtml(title)}</h1>`);
  }

  for (const seg of segments) {
    const html = convertMarkersToHtml(seg, enabledTypes);
    if (BLOCK_TAGS.test(html)) {
      parts.push(html);
    } else {
      const withBr = html.replace(/\n/g, '<br>');
      parts.push(`<p>${withBr}</p>`);
    }
  }

  return parts.join('\n');
}

/**
 * Get translated text from chapter
 * Uses paragraphs if available, falls back to chapter.translatedText
 */
export function getTranslatedText(chapter: Chapter): string {
  // Try to get from paragraphs first (more accurate)
  if (chapter.paragraphs && chapter.paragraphs.length > 0) {
    const text = mergeParagraphsToText(chapter.paragraphs, 'translatedText');
    if (text && text.trim().length > 0) {
      return text;
    }
  }

  // Fallback to chapter.translatedText
  return chapter.translatedText || '';
}

/**
 * Prepare project data for export
 * Filters and prepares only completed chapters
 */
export function prepareProjectForExport(
  project: Project,
  author?: string,
  textBlockTypes?: TextBlockType[],
  includeChapterTitleInHtml: boolean = true
): ExportProject {
  // Filter completed or draft chapters with translations (draft = translation saved, editing not applied)
  const completedChapters = project.chapters
    .filter((ch) => {
      const hasTranslation =
        (ch.status === 'completed' || ch.status === 'draft') &&
        (ch.translatedText || (ch.paragraphs && ch.paragraphs.some((p) => p.translatedText)));
      return hasTranslation;
    })
    .sort((a, b) => a.number - b.number);

  const blockTypes = textBlockTypes && textBlockTypes.length > 0 ? textBlockTypes : [];

  // Prepare chapters for export
  const exportChapters: ExportChapter[] = completedChapters.map((chapter) => {
    const translatedText = getTranslatedText(chapter);
    const htmlContent =
      blockTypes.length > 0
        ? textToHtmlWithBlocks(translatedText, blockTypes, includeChapterTitleInHtml, chapter.title)
        : textToHtml(translatedText, includeChapterTitleInHtml, chapter.title);
    const textContent = translatedText;

    return {
      title: chapter.title,
      number: chapter.number,
      htmlContent,
      textContent,
    };
  });

  // Get latest translation metadata
  const latestTranslation = completedChapters
    .filter((ch) => ch.translationMeta)
    .sort((a, b) => {
      const aTime = a.translationMeta?.translatedAt || '';
      const bTime = b.translationMeta?.translatedAt || '';
      return bTime.localeCompare(aTime);
    })[0];

  return {
    title: project.name,
    author: author || 'Переведено Arcane',
    language: project.targetLanguage || 'ru',
    chapters: exportChapters,
    textBlockTypes: blockTypes.length > 0 ? blockTypes : undefined,
    metadata: {
      translatedAt: latestTranslation?.translationMeta?.translatedAt,
      model: latestTranslation?.translationMeta?.model,
      totalChapters: exportChapters.length,
    },
  };
}
