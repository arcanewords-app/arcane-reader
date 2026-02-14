/**
 * Glossary filter for chunk-level token optimization.
 *
 * Filters glossary entries to only those that appear in the given text chunk,
 * reducing token usage when translating/editing large glossaries.
 */

import type { Glossary, Character, Location, Term } from '../types/glossary.js';

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text contains a name/term as a whole word (case-insensitive).
 * Also matches when the name is a multi-word phrase and the first word appears alone
 * (e.g. "Harry" in chunk matches "Harry Potter" in glossary).
 */
function textContainsReference(text: string, original: string): boolean {
  if (!original || !original.trim()) return false;
  const normalized = original.trim();
  const escaped = escapeRegex(normalized);
  // Whole phrase match: \bHarry Potter\b
  const phraseRe = new RegExp(`\\b${escaped}\\b`, 'i');
  if (phraseRe.test(text)) return true;
  // Multi-word: also match first word alone (e.g. "Harry" from "Harry Potter")
  const words = normalized.split(/\s+/);
  if (words.length > 1 && words[0].length > 1) {
    const firstWordEscaped = escapeRegex(words[0]);
    const firstWordRe = new RegExp(`\\b${firstWordEscaped}\\b`, 'i');
    if (firstWordRe.test(text)) return true;
  }
  return false;
}

/**
 * Filter glossary to entries that appear in the given text chunk.
 * Uses case-insensitive whole-word matching on original names/terms.
 * For characters: also checks aliases if present.
 */
export function filterGlossaryForChunk(text: string, glossary: Glossary): Glossary {
  if (!text || !text.trim()) {
    return {
      ...glossary,
      characters: [],
      locations: [],
      terms: [],
    };
  }

  const chunk = text.trim();

  const characters: Character[] = glossary.characters.filter((char) => {
    if (textContainsReference(chunk, char.originalName)) return true;
    for (const alias of char.aliases ?? []) {
      if (alias && textContainsReference(chunk, alias)) return true;
    }
    return false;
  });

  const locations: Location[] = glossary.locations.filter((loc) =>
    textContainsReference(chunk, loc.originalName)
  );

  const terms: Term[] = glossary.terms.filter((term) =>
    textContainsReference(chunk, term.originalTerm)
  );

  return {
    ...glossary,
    characters,
    locations,
    terms,
  };
}
