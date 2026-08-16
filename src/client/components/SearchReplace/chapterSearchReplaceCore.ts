import type { Paragraph } from '../../types.js';
import { replaceInText, type SearchMatch } from '../../utils/search-utils.js';
import type { ReplacePreviewItem } from './ReplacePreviewModal.js';

export const CHAPTER_SEARCH_DEBOUNCE_MS = 250;
export const CHAPTER_SEARCH_MAX_FIND_LENGTH = 2000;

export type SearchHighlight = {
  paragraphIds: string[];
  currentParagraphId: string | null;
};

/** Trim + length-cap for the find field before debounce settles. */
export function trimFindQuery(find: string, maxLength = CHAPTER_SEARCH_MAX_FIND_LENGTH): string {
  return find.trim().slice(0, maxLength);
}

export function clampMatchIndex(currentIndex: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  if (currentIndex >= matchCount) return matchCount - 1;
  if (currentIndex < 0) return 0;
  return currentIndex;
}

export function nextMatchIndex(currentIndex: number, matchCount: number): number {
  if (matchCount === 0) return 0;
  return currentIndex >= matchCount - 1 ? 0 : currentIndex + 1;
}

export function prevMatchIndex(currentIndex: number, matchCount: number): number {
  if (matchCount === 0) return 0;
  return currentIndex <= 0 ? matchCount - 1 : currentIndex - 1;
}

export function buildSearchHighlight(
  matches: SearchMatch[],
  currentIndex: number
): SearchHighlight {
  if (matches.length === 0) {
    return { paragraphIds: [], currentParagraphId: null };
  }
  const ids = [...new Set(matches.map((m) => m.paragraphId))];
  const current = matches[currentIndex];
  return {
    paragraphIds: ids,
    currentParagraphId: current ? current.paragraphId : null,
  };
}

export function canReplaceInChapter(params: {
  hasOnReplace: boolean;
  isOriginalReadingMode: boolean;
  debouncedFind: string;
  replace: string;
  hasMatches: boolean;
}): boolean {
  return (
    params.hasOnReplace &&
    !params.isOriginalReadingMode &&
    !!params.debouncedFind &&
    params.replace.trim() !== params.debouncedFind &&
    params.hasMatches
  );
}

export function buildReplacePreviewItems(params: {
  paragraphs: Paragraph[];
  matches: SearchMatch[];
  debouncedFind: string;
  replace: string;
  caseSensitive: boolean;
  hasMatches: boolean;
  previewSliceLength?: number;
}): ReplacePreviewItem[] {
  const {
    paragraphs,
    matches,
    debouncedFind,
    replace,
    caseSensitive,
    hasMatches,
    previewSliceLength = 150,
  } = params;
  if (!debouncedFind || !hasMatches) return [];

  const byPara = new Map<string, Paragraph>();
  for (const p of paragraphs) {
    byPara.set(p.id, p);
  }
  const seen = new Set<string>();
  const items: ReplacePreviewItem[] = [];
  for (const m of matches) {
    if (seen.has(m.paragraphId)) continue;
    seen.add(m.paragraphId);
    const p = byPara.get(m.paragraphId);
    if (!p) continue;
    const text = m.field === 'translated' ? p.translatedText || '' : p.originalText || '';
    const after = replaceInText(text, debouncedFind, replace, true, caseSensitive);
    if (after !== text) {
      items.push({
        paragraphId: m.paragraphId,
        paragraphIndex: m.paragraphIndex,
        before: text.slice(0, previewSliceLength) + (text.length > previewSliceLength ? '…' : ''),
        after: after.slice(0, previewSliceLength) + (after.length > previewSliceLength ? '…' : ''),
      });
    }
  }
  return items;
}

export function searchFieldForMode(isOriginalReadingMode: boolean): 'original' | 'translated' {
  return isOriginalReadingMode ? 'original' : 'translated';
}
