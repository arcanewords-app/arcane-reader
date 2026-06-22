/**
 * Search utilities for find & replace in chapter paragraphs.
 * Literal match (no regex) with escaped special characters.
 */

import type { Paragraph } from '../types';
import { escapeRegex, createSnippetHtml } from '../../shared/projectSearch.js';

export {
  createSnippetHtml,
  matchesWholeWord,
  filterProjectMatches,
  dedupeParagraphMatches,
  paragraphMatchKey,
  replaceInText,
} from '../../shared/projectSearch.js';

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
