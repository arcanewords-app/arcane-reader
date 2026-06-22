/**
 * Shared search/replace helpers for project-wide find (client + server).
 */

export interface ProjectSearchMatchBase {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  paragraphId: string;
  paragraphIndex: number;
  field: 'original' | 'translated';
  snippet: string;
  fullText: string;
}

export interface ProjectSearchFilters {
  chapterFrom?: number;
  chapterTo?: number;
  filterQuery?: string;
  textBlockType?: string;
}

/** Escape special regex characters for literal string match */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function paragraphMatchKey(chapterId: string, paragraphId: string): string {
  return `${chapterId}-${paragraphId}`;
}

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}

/** Whether text contains query as a whole word (Unicode-aware). */
export function matchesWholeWord(text: string, query: string, caseSensitive = false): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  let idx = 0;

  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    const before = idx === 0 ? '' : (text[idx - 1] ?? '');
    const after = idx + needle.length >= text.length ? '' : (text[idx + needle.length] ?? '');
    const beforeOk = idx === 0 || !isWordChar(before);
    const afterOk = idx + needle.length >= text.length || !isWordChar(after);
    if (beforeOk && afterOk) return true;
    idx += 1;
  }
  return false;
}

/** Whether text contains query (substring, optional case sensitivity). */
export function textContainsQuery(text: string, query: string, caseSensitive = false): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  if (caseSensitive) return text.includes(trimmed);
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

const SNIPPET_CONTEXT = 50;

export function createMatchSnippet(text: string, query: string, caseSensitive = false): string {
  const trimmed = query.trim();
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
  const idx = hay.indexOf(needle);
  if (idx === -1) return text.slice(0, 120);

  const start = Math.max(0, idx - SNIPPET_CONTEXT);
  const end = Math.min(text.length, idx + trimmed.length + SNIPPET_CONTEXT);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}

/** Wrap match in <mark> for highlight display */
export function createSnippetHtml(snippet: string, find: string, caseSensitive: boolean): string {
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = escapeRegex(find);
  const re = new RegExp(`(${escaped})`, flags);
  return snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(re, '<mark>$1</mark>');
}

const BLOCK_TYPE_RE = /\{\{block:(\w+)\}\}/;

export function extractTextBlockType(text: string): string | null {
  const m = text.match(BLOCK_TYPE_RE);
  return m?.[1] ?? null;
}

/** Deduplicate matches to one row per paragraph (keeps first occurrence). */
export function dedupeParagraphMatches<T extends ProjectSearchMatchBase>(matches: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const m of matches) {
    const key = paragraphMatchKey(m.chapterId, m.paragraphId);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  return result;
}

/** Client-side filters applied on top of server results. */
export function filterProjectMatches<T extends ProjectSearchMatchBase>(
  matches: T[],
  filters: ProjectSearchFilters
): T[] {
  const { chapterFrom, chapterTo, filterQuery, textBlockType } = filters;
  const fq = filterQuery?.trim();

  return matches.filter((m) => {
    if (chapterFrom != null && m.chapterNumber < chapterFrom) return false;
    if (chapterTo != null && m.chapterNumber > chapterTo) return false;
    if (fq) {
      const hay = `${m.snippet} ${m.fullText}`.toLowerCase();
      if (!hay.includes(fq.toLowerCase())) return false;
    }
    if (textBlockType) {
      const blockType = extractTextBlockType(m.fullText);
      if (blockType !== textBlockType) return false;
    }
    return true;
  });
}

/** Literal replace in text */
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

export interface ProjectSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** Check if paragraph text matches search criteria */
export function paragraphMatchesSearch(
  text: string,
  query: string,
  options: ProjectSearchOptions = {}
): boolean {
  const { caseSensitive = false, wholeWord = false } = options;
  if (wholeWord) return matchesWholeWord(text, query, caseSensitive);
  return textContainsQuery(text, query, caseSensitive);
}
