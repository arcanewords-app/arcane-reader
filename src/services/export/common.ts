/**
 * Common export utilities
 * Shared logic for EPUB and FB2 export
 */

import type { Project, Chapter } from '../../storage/database.js';
import { mergeParagraphsToText } from '../../storage/database.js';

/**
 * Export chapter data structure
 */
export interface ExportChapter {
  title: string;
  number: number;
  htmlContent: string; // HTML formatted content
  textContent: string; // Plain text content
}

/**
 * Export project data structure
 */
export interface ExportProject {
  title: string;
  author?: string;
  language: string;
  chapters: ExportChapter[];
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
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Convert paragraphs to <p> tags
  const htmlParagraphs = paragraphs
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  // Add title if needed
  if (includeTitle && title) {
    return `<h1>${escapeHtml(title)}</h1>\n${htmlParagraphs}`;
  }

  return htmlParagraphs;
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
export function prepareProjectForExport(project: Project, author?: string): ExportProject {
  // Filter only completed chapters with translations
  const completedChapters = project.chapters
    .filter(ch => {
      const hasTranslation = ch.status === 'completed' && 
        (ch.translatedText || (ch.paragraphs && ch.paragraphs.some(p => p.translatedText)));
      return hasTranslation;
    })
    .sort((a, b) => a.number - b.number);

  // Prepare chapters for export
  const exportChapters: ExportChapter[] = completedChapters.map(chapter => {
    const translatedText = getTranslatedText(chapter);
    const htmlContent = textToHtml(translatedText, true, chapter.title);
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
    .filter(ch => ch.translationMeta)
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
    metadata: {
      translatedAt: latestTranslation?.translationMeta?.translatedAt,
      model: latestTranslation?.translationMeta?.model,
      totalChapters: exportChapters.length,
    },
  };
}
