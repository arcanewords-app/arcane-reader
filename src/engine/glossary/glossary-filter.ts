/**
 * Glossary filter for chunk-level token optimization.
 *
 * Filters glossary entries to only those that appear in the given text chunk,
 * reducing token usage when translating/editing large glossaries.
 *
 * Also provides filterGlossaryByChapter for chapter-scoped glossary filtering
 * (mentionedInChapters as primary criterion for translation/editing).
 */

import { isLatinScriptName } from '../language.js';
import type { Glossary, Character, Location, Term } from '../types/glossary.js';
import type { Declensions } from '../types/common.js';

const DEFAULT_CHAPTER_CAST_CAP = 25;

/** Minimum reference length for non-Latin substring matching (reduces false positives). */
const MIN_SUBSTRING_MATCH_LENGTH = 2;

/**
 * - source: match original names/terms (and aliases) — Stage 2 Translate on source text.
 * - target: match translated forms and declensions — Stage 3 Edit on translated text.
 */
export type GlossaryChunkMatchMode = 'source' | 'target';

/**
 * Characters for chapter cast injection (gender tags). Characters only — not locations/terms.
 * Prioritizes main characters, then earlier firstAppearance. Capped to limit tokens.
 */
export function getChapterCastCharacters(
  glossary: Glossary,
  chapterNumber: number,
  cap = DEFAULT_CHAPTER_CAST_CAP
): Character[] {
  const chapterChars = filterGlossaryByChapter(glossary, chapterNumber).characters;
  const sorted = [...chapterChars].sort((a, b) => {
    if (a.isMainCharacter !== b.isMainCharacter) {
      return a.isMainCharacter ? -1 : 1;
    }
    return a.firstAppearance - b.firstAppearance;
  });
  return sorted.slice(0, cap);
}

/**
 * Filter glossary to entries that were extracted in the given chapter (or have no chapter data).
 * Used as primary filter before filterGlossaryForChunk when translating/editing chapter N.
 * Entries with empty/undefined mentionedInChapters are included (backward compatibility).
 */
export function filterGlossaryByChapter(glossary: Glossary, chapterNumber: number): Glossary {
  const includeByChapters = (chapters: number[] | undefined): boolean =>
    !chapters || chapters.length === 0 || chapters.includes(chapterNumber);

  return {
    ...glossary,
    characters: glossary.characters.filter((c) => includeByChapters(c.mentionedInChapters)),
    locations: glossary.locations.filter((l) => includeByChapters(l.mentionedInChapters)),
    terms: glossary.terms.filter((t) => includeByChapters(t.mentionedInChapters)),
  };
}

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Latin-script whole-word match (case-insensitive) with first-word fallback for multi-word names. */
function textContainsLatinReference(text: string, reference: string): boolean {
  const normalized = reference.trim();
  const escaped = escapeRegex(normalized);
  const phraseRe = new RegExp(`\\b${escaped}\\b`, 'i');
  if (phraseRe.test(text)) return true;
  const words = normalized.split(/\s+/);
  if (words.length > 1 && words[0].length > 1) {
    const firstWordEscaped = escapeRegex(words[0]);
    const firstWordRe = new RegExp(`\\b${firstWordEscaped}\\b`, 'i');
    if (firstWordRe.test(text)) return true;
  }
  return false;
}

/** Substring match for CJK, Hangul, Cyrillic, etc. (case-insensitive). */
function textContainsSubstringReference(text: string, reference: string): boolean {
  const ref = reference.trim();
  if (!ref || ref.length < MIN_SUBSTRING_MATCH_LENGTH) return false;
  return text.toLowerCase().includes(ref.toLowerCase());
}

/**
 * Check if text contains a name/term reference.
 * Latin references use word boundaries; other scripts use case-insensitive substring match.
 */
function textContainsReference(text: string, reference: string): boolean {
  if (!reference || !reference.trim()) return false;
  if (isLatinScriptName(reference)) {
    return textContainsLatinReference(text, reference);
  }
  return textContainsSubstringReference(text, reference);
}

function declensionForms(declensions: Declensions | undefined): string[] {
  if (!declensions) return [];
  return [
    declensions.nominative,
    declensions.genitive,
    declensions.dative,
    declensions.accusative,
    declensions.instrumental,
    declensions.prepositional,
  ].filter((form): form is string => Boolean(form?.trim()));
}

function characterMatchesChunk(
  char: Character,
  chunk: string,
  matchMode: GlossaryChunkMatchMode
): boolean {
  if (matchMode === 'source') {
    if (textContainsReference(chunk, char.originalName)) return true;
    for (const alias of char.aliases ?? []) {
      if (alias && textContainsReference(chunk, alias)) return true;
    }
    return false;
  }
  if (textContainsReference(chunk, char.translatedName)) return true;
  for (const form of declensionForms(char.declensions)) {
    if (textContainsReference(chunk, form)) return true;
  }
  return false;
}

function locationMatchesChunk(
  loc: Location,
  chunk: string,
  matchMode: GlossaryChunkMatchMode
): boolean {
  const reference = matchMode === 'source' ? loc.originalName : loc.translatedName;
  return textContainsReference(chunk, reference);
}

function termMatchesChunk(term: Term, chunk: string, matchMode: GlossaryChunkMatchMode): boolean {
  const reference = matchMode === 'source' ? term.originalTerm : term.translatedTerm;
  return textContainsReference(chunk, reference);
}

/**
 * Filter glossary to entries that appear in the given text chunk.
 * Source mode: original names/terms (+ character aliases). Target mode: translated forms and declensions.
 */
export function filterGlossaryForChunk(
  text: string,
  glossary: Glossary,
  matchMode: GlossaryChunkMatchMode = 'source'
): Glossary {
  if (!text || !text.trim()) {
    return {
      ...glossary,
      characters: [],
      locations: [],
      terms: [],
    };
  }

  const chunk = text.trim();

  const characters: Character[] = glossary.characters.filter((char) =>
    characterMatchesChunk(char, chunk, matchMode)
  );

  const locations: Location[] = glossary.locations.filter((loc) =>
    locationMatchesChunk(loc, chunk, matchMode)
  );

  const terms: Term[] = glossary.terms.filter((term) => termMatchesChunk(term, chunk, matchMode));

  return {
    ...glossary,
    characters,
    locations,
    terms,
  };
}
