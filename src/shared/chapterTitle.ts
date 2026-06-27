/**
 * Chapter title helpers — display title, generic detection, localization.
 * Shared between server and client.
 */

import type { Language } from '../engine/types/common.js';

export const CHAPTER_TITLE_BATCH_SIZE = 25;
export const MAX_CHAPTER_TITLE_LENGTH = 200;

export interface ChapterTitleFields {
  title: string;
  translatedTitle?: string | null;
  number: number;
}

/** Display title: translated if available, else original, else fallback. */
export function chapterDisplayTitle(ch: ChapterTitleFields): string {
  const translated = ch.translatedTitle?.trim();
  if (translated) return translated;
  const original = ch.title?.trim();
  if (original) return original;
  return defaultChapterTitleFallback(ch.number);
}

/** Title shown in the edit field — matches what the user sees in the header. */
export function chapterTitleForEdit(ch: ChapterTitleFields): string {
  return chapterDisplayTitle(ch);
}

/** Sidebar / modal list filter — matches display title, original title, number. */
export function chapterMatchesListSearch(ch: ChapterTitleFields, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (String(ch.number).includes(q)) return true;
  const title = ch.title?.trim().toLowerCase() ?? '';
  if (title.includes(q)) return true;
  const translated = ch.translatedTitle?.trim().toLowerCase() ?? '';
  if (translated.includes(q)) return true;
  return chapterDisplayTitle(ch).toLowerCase().includes(q);
}

export function defaultChapterTitleFallback(number: number): string {
  return `Chapter ${number}`;
}

/** True when title is an import/parser fallback like "Глава 5" or "Chapter 5". */
export function isGenericChapterTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  const patterns = [
    /^глава\s*[\d.:：\-—]+/i,
    /^chapter\s*[\d.:：\-—]*/i,
    /^ch\.?\s*\d+/i,
    /^episode\s*\d+/i,
    /^第\s*\d+\s*[章话节回]/,
    /^part\s*\d+/i,
    /^section\s*\d+/i,
  ];
  return patterns.some((p) => p.test(t));
}

/** Localized default title for generic fallbacks (no LLM). */
export function localizedDefaultChapterTitle(number: number, targetLanguage: Language): string {
  if (targetLanguage === 'be' || targetLanguage === 'ru') {
    return `Глава ${number}`;
  }
  return `Chapter ${number}`;
}

export function truncateChapterTitle(title: string, maxLen = MAX_CHAPTER_TITLE_LENGTH): string {
  const t = title.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

/** Whether chapter has a body translation (for manual title edit target field). */
export function chapterHasBodyTranslation(ch: {
  status?: string;
  translatedText?: string | null;
  hasTranslation?: boolean;
}): boolean {
  if (ch.hasTranslation === true) return true;
  if (ch.status === 'completed' || ch.status === 'draft' || ch.status === 'partial') return true;
  const text = ch.translatedText?.trim();
  return !!text && !text.startsWith('❌');
}
