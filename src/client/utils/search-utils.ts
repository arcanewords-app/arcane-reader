/**
 * Search utilities for find & replace in chapter paragraphs.
 * Literal match (no regex) with escaped special characters.
 */

import type { Paragraph } from '../types';

/** Escape special regex characters for literal string match */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SearchMatch {
  paragraphId: string;
  paragraphIndex: number;
  field: 'original' | 'translated';
  snippet: string;
  snippetHtml: string;
  fullText: string;
}

const SNIPPET_CONTEXT = 50;

/**
 * Create snippet with highlighted match. Returns ~80-120 chars with match centered.
 */
function createSnippet(text: string, matchStart: number, matchEnd: number): string {
  const before = Math.max(0, matchStart - SNIPPET_CONTEXT);
  const after = Math.min(text.length, matchEnd + SNIPPET_CONTEXT);
  let snippet = text.slice(before, after);
  if (before > 0) snippet = '…' + snippet;
  if (after < text.length) snippet = snippet + '…';
  return snippet;
}

/**
 * Wrap match in <mark> for highlight display
 */
function createSnippetHtml(snippet: string, find: string, caseSensitive: boolean): string {
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = escapeRegex(find);
  const re = new RegExp(`(${escaped})`, flags);
  return snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(re, '<mark>$1</mark>');
}

export type SearchField = 'original' | 'translated' | 'both';

/**
 * Search paragraphs for literal match. Returns flat list of matches.
 */
export function searchInParagraphs(
  paragraphs: Paragraph[],
  find: string,
  field: SearchField = 'translated',
  caseSensitive = false
): SearchMatch[] {
  const trimmed = find.trim();
  if (!trimmed) return [];

  const matches: SearchMatch[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];

    if (field === 'original' || field === 'both') {
      const text = p.originalText || '';
      let m: RegExpExecArray | null;
      const re2 = new RegExp(escapeRegex(trimmed), caseSensitive ? 'g' : 'gi');
      while ((m = re2.exec(text)) !== null) {
        const snippet = createSnippet(text, m.index, m.index + m[0].length);
        matches.push({
          paragraphId: p.id,
          paragraphIndex: i + 1,
          field: 'original',
          snippet,
          snippetHtml: createSnippetHtml(snippet, trimmed, caseSensitive),
          fullText: text,
        });
      }
    }

    if (field === 'translated' || field === 'both') {
      const text = p.translatedText || '';
      let m: RegExpExecArray | null;
      const re2 = new RegExp(escapeRegex(trimmed), caseSensitive ? 'g' : 'gi');
      while ((m = re2.exec(text)) !== null) {
        const snippet = createSnippet(text, m.index, m.index + m[0].length);
        matches.push({
          paragraphId: p.id,
          paragraphIndex: i + 1,
          field: 'translated',
          snippet,
          snippetHtml: createSnippetHtml(snippet, trimmed, caseSensitive),
          fullText: text,
        });
      }
    }
  }

  return matches;
}

/**
 * Replace first or all occurrences in text. Literal match.
 */
export function replaceInText(
  text: string,
  find: string,
  replace: string,
  replaceAll: boolean,
  caseSensitive: boolean
): string {
  const trimmed = find.trim();
  if (!trimmed) return text;

  const flags = (replaceAll ? 'g' : '') + (caseSensitive ? '' : 'i');
  const re = new RegExp(escapeRegex(trimmed), flags);
  return text.replace(re, replace);
}
