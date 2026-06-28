/**
 * Text and reader-settings utilities (no DB I/O).
 */

import type {
  Chapter,
  FontFamily,
  Paragraph,
  ParagraphStatus,
  Project,
  ProjectSettings,
  ReaderSettings,
} from './types.js';

/** Default reader settings */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: 'default',
  fontSize: 16,
  lineHeight: 1.6,
  colorScheme: 'dark',
  textIndent: false,
  textAlign: 'justify',
  hideChapterHeader: false,
  paragraphSpacing: 0.5,
  containerWidth: 69,
};

/** Legacy font keys for migration from old settings */
export const LEGACY_FONT_MAP: Record<string, FontFamily> = {
  literary: 'default',
  serif: 'cormorant_garamond',
  sans: 'roboto',
  mono: 'roboto',
  helvetica: 'helvetica',
};

/**
 * Get reader settings for a project (with defaults for old projects).
 * Accepts Project or ProjectWithChapterList - only settings.reader is used.
 */
export function getReaderSettings(
  project: Project | { settings: ProjectSettings }
): ReaderSettings {
  const raw = project.settings.reader;
  if (!raw) return { ...DEFAULT_READER_SETTINGS };

  let fontFamily = raw.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily;
  const legacyMapped = LEGACY_FONT_MAP[fontFamily as string];
  if (legacyMapped) fontFamily = legacyMapped;

  let paragraphSpacing = raw.paragraphSpacing ?? DEFAULT_READER_SETTINGS.paragraphSpacing;
  if (paragraphSpacing > 2) paragraphSpacing = Math.min(2, paragraphSpacing / 16);

  const merged: ReaderSettings = {
    ...DEFAULT_READER_SETTINGS,
    fontFamily,
    fontSize: raw.fontSize ?? DEFAULT_READER_SETTINGS.fontSize,
    lineHeight: raw.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight,
    colorScheme: raw.colorScheme ?? DEFAULT_READER_SETTINGS.colorScheme,
    textIndent: raw.textIndent ?? DEFAULT_READER_SETTINGS.textIndent,
    textAlign: raw.textAlign ?? DEFAULT_READER_SETTINGS.textAlign,
    hideChapterHeader: raw.hideChapterHeader ?? DEFAULT_READER_SETTINGS.hideChapterHeader,
    paragraphSpacing,
    containerWidth: raw.containerWidth ?? DEFAULT_READER_SETTINGS.containerWidth,
  };
  if (raw.customBg != null) merged.customBg = raw.customBg;
  if (raw.customText != null) merged.customText = raw.customText;

  return merged;
}

function isSeparatorParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const separatorPattern = /^[\s*\-_=~#]+$/;
  return separatorPattern.test(trimmed);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Parse text into paragraphs
 * Splits by double newlines, filters empty paragraphs and separators
 */
export function parseTextToParagraphs(text: string): Paragraph[] {
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !isSeparatorParagraph(p));

  return rawParagraphs.map((content, index) => ({
    id: generateId(),
    index,
    originalText: content,
    status: 'pending' as ParagraphStatus,
  }));
}

/**
 * Merge paragraphs back into single text
 */
export function mergeParagraphsToText(
  paragraphs: Paragraph[],
  field: 'originalText' | 'translatedText' = 'translatedText'
): string {
  return paragraphs
    .sort((a, b) => a.index - b.index)
    .map((p) => p[field] || '')
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * Get chapter completion stats
 */
export function getChapterStats(chapter: Chapter): {
  total: number;
  pending: number;
  translated: number;
  edited: number;
  approved: number;
  progress: number;
} {
  const paragraphs = chapter.paragraphs || [];
  const total = paragraphs.length;

  if (total === 0) {
    return { total: 0, pending: 0, translated: 0, edited: 0, approved: 0, progress: 0 };
  }

  const counts = {
    pending: 0,
    translated: 0,
    edited: 0,
    approved: 0,
  };

  for (const p of paragraphs) {
    counts[p.status]++;
  }

  const completed = counts.translated + counts.edited + counts.approved;
  const progress = Math.round((completed / total) * 100);

  return { total, ...counts, progress };
}
