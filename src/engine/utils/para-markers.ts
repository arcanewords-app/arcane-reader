/**
 * Paragraph marker utilities for translation/editing pipeline.
 * Format: --para:{id}--{text}
 */

export const PARA_MARKER_PREFIX = '--para:';
export const PARA_MARKER_SUFFIX = '--';

const FULL_MARKER_ID_RE = /^--para:.+--$/;
const PARA_MARKER_TEST_RE = /--para:[^\n]*?--/;

export function textHasParagraphMarkers(text: string): boolean {
  return PARA_MARKER_TEST_RE.test(text);
}

export function normalizeParagraphId(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (FULL_MARKER_ID_RE.test(trimmed)) return trimmed;
  const bare = trimmed.replace(/^--para:/, '').replace(/--$/, '');
  if (!bare) return null;
  return `${PARA_MARKER_PREFIX}${bare}${PARA_MARKER_SUFFIX}`;
}

export function isNormalizedParagraphMarkerId(id: string): boolean {
  return FULL_MARKER_ID_RE.test(id.trim());
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Separator-only paragraphs (e.g. ***, ---) — aligned with production parseTextToParagraphs. */
export function isSeparatorParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return /^[\s*\-_=~#]+$/.test(trimmed);
}

export function stripParagraphMarkers(text: string): string {
  return text.replace(/--para:[^\n]*?--/g, '').trim();
}

/**
 * Split text into paragraph bodies (production parseTextToParagraphs logic).
 * Strips existing markers first so partial marker coverage still re-splits correctly.
 */
export function splitTextToParagraphContents(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const plain = textHasParagraphMarkers(normalized)
    ? stripParagraphMarkers(normalized)
    : normalized;
  return splitIntoParagraphs(plain).filter((p) => !isSeparatorParagraph(p));
}

function buildAutoMarkedParagraphs(paragraphs: string[]): string {
  return markParagraphContentsForTranslation(paragraphs);
}

/** Mark paragraph bodies for translation pipeline (Lab: auto_N ids; prod may pass UUIDs). */
export function markParagraphContentsForTranslation(paragraphs: string[], ids?: string[]): string {
  if (paragraphs.length === 0) return '';
  return paragraphs
    .map((para, i) => {
      const id = ids?.[i] ?? `auto_${i}`;
      return `${PARA_MARKER_PREFIX}${id}${PARA_MARKER_SUFFIX}${para}`;
    })
    .join('\n\n');
}

/**
 * Canonical Lab source text: always re-parse from plain text (strip markers, split, re-inject).
 */
export function normalizeLabSourceText(text: string): string {
  if (!text.trim()) return text;
  const paragraphs = splitTextToParagraphContents(text);
  if (paragraphs.length === 0) return text.replace(/\r\n/g, '\n').trim() || text;
  return buildAutoMarkedParagraphs(paragraphs);
}

/** SSOT for translate stage source — same as normalizeLabSourceText (Reader always marks before translate). */
export const prepareTranslateSourceText = normalizeLabSourceText;

/**
 * Inject --para:{id}-- markers when absent. Re-normalizes partial marker coverage.
 */
export function injectParagraphMarkers(text: string, ids?: string[]): string {
  if (!text.trim()) return text;
  if (textHasParagraphMarkers(text)) {
    const parsed = parseParagraphMarkers(text);
    const contents = splitTextToParagraphContents(text);
    if (parsed.length > 1 && parsed.length === contents.length) {
      return text;
    }
    if (contents.length === 0) return text;
    if (ids?.length) {
      return contents
        .map((para, i) => {
          const id = ids[i] ?? `auto_${i}`;
          return `${PARA_MARKER_PREFIX}${id}${PARA_MARKER_SUFFIX}${para}`;
        })
        .join('\n\n');
    }
    return buildAutoMarkedParagraphs(contents);
  }

  const paragraphs = splitTextToParagraphContents(text);
  if (paragraphs.length === 0) return text;

  return paragraphs
    .map((para, i) => {
      if (para.startsWith(PARA_MARKER_PREFIX)) return para;
      const id = ids?.[i] ?? `auto_${i}`;
      return `${PARA_MARKER_PREFIX}${id}${PARA_MARKER_SUFFIX}${para}`;
    })
    .join('\n\n');
}

export interface ParsedParagraphMarker {
  id: string;
  text: string;
}

/**
 * Parse text containing --para:{id}-- markers into { id, text } pairs.
 */
export function parseParagraphMarkers(text: string): ParsedParagraphMarker[] {
  const results: ParsedParagraphMarker[] = [];
  const re = /--para:([^\n]*?)--/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;
  while ((match = re.exec(text)) !== null) {
    if (results.length > 0) {
      results[results.length - 1].text = text.slice(lastEnd, match.index).trim();
    }
    results.push({ id: match[1].trim(), text: '' });
    lastEnd = match.index + match[0].length;
  }
  if (results.length > 0) {
    results[results.length - 1].text = text.slice(lastEnd).trim();
  }
  return results;
}

/**
 * Split text into display paragraphs: blank-line split (production logic), marker ids when aligned.
 */
export function textToDisplayParagraphs(text: string): { id?: string; text: string }[] {
  if (!text.trim()) return [];

  const contents = splitTextToParagraphContents(text);
  if (contents.length === 0) return [];

  if (textHasParagraphMarkers(text)) {
    const parsed = parseParagraphMarkers(text);
    if (parsed.length === contents.length && parsed.length > 0) {
      return contents.map((body, i) => ({ id: parsed[i]?.id ?? `auto_${i}`, text: body }));
    }
  }

  return contents.map((p, i) => ({ id: `auto_${i}`, text: p }));
}

export interface JsonParagraphRow {
  id?: string;
  translated?: string;
}

/**
 * Merge JSON paragraph rows into marked text, tolerating partial marker ids from models.
 */
export function mergeJsonParagraphsToMarkedText(paras: JsonParagraphRow[]): string {
  const normalized = paras
    .map((p) => {
      let translated = (p.translated ?? '').trim();
      let markerId = normalizeParagraphId(p.id);

      if (!markerId && translated.startsWith(PARA_MARKER_PREFIX)) {
        const m = /^(--para:[^\n]*?--)([\s\S]*)$/.exec(translated);
        if (m) {
          markerId = m[1];
          translated = m[2].trim();
        }
      }

      return { markerId, translated };
    })
    .filter((p) => p.translated.length > 0);

  const hasAnyMarker = normalized.some((p) => p.markerId !== null);
  if (!hasAnyMarker) {
    if (normalized.length === 1) return normalized[0].translated;
    return normalized.map((p) => p.translated).join('\n\n');
  }

  return normalized
    .map((p) => (p.markerId ? `${p.markerId}${p.translated}` : p.translated))
    .join('\n\n');
}

export function jsonParagraphsHaveMarkers(paras: JsonParagraphRow[]): boolean {
  return paras.some((p) => {
    const id = normalizeParagraphId(p.id);
    if (id) return true;
    const t = (p.translated ?? '').trim();
    return t.startsWith(PARA_MARKER_PREFIX);
  });
}

/**
 * Normalized --para:…-- ids present in chunk source text (SSOT for expected JSON rows).
 */
export function collectExpectedParagraphMarkerIds(chunkContent: string): Set<string> {
  const parsed = parseParagraphMarkers(chunkContent);
  const ids = new Set<string>();
  for (const p of parsed) {
    const norm = normalizeParagraphId(p.id);
    if (norm) {
      ids.add(norm);
    } else if (p.id) {
      ids.add(`${PARA_MARKER_PREFIX}${p.id}${PARA_MARKER_SUFFIX}`);
    }
  }
  return ids;
}

/**
 * Keep only JSON paragraph rows that belong to the current chunk.
 * When chunk has no markers, cap to expected paragraph count from content split.
 */
export function filterJsonParagraphsToChunk(
  paras: JsonParagraphRow[],
  chunkContent: string
): JsonParagraphRow[] {
  const expectedIds = collectExpectedParagraphMarkerIds(chunkContent);

  if (expectedIds.size > 0) {
    return paras.filter((p) => {
      const id = normalizeParagraphId(p.id);
      if (id && expectedIds.has(id)) return true;
      const translated = (p.translated ?? '').trim();
      const markerMatch = /^(--para:[^\n]*?--)/.exec(translated);
      return markerMatch !== null && expectedIds.has(markerMatch[1]);
    });
  }

  const expectedCount = splitTextToParagraphContents(chunkContent).length;
  if (expectedCount > 0 && paras.length > expectedCount) {
    return paras.slice(0, expectedCount);
  }
  return paras;
}

const TRANSLATION_PARAGRAPHS_JSON_RE = /\{[\s\S]*"paragraphs"[\s\S]*\}/;

/**
 * Unwrap translate-stage JSON (`{ paragraphs: [{ id, translated }] }`) into marked/plain text.
 * Returns null when input is not valid translation JSON.
 */
export function tryParseTranslationParagraphsJson(
  text: string,
  chunkContent?: string
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.includes('"paragraphs"')) return null;

  let parsed: { paragraphs?: JsonParagraphRow[] };
  try {
    const jsonMatch = trimmed.match(TRANSLATION_PARAGRAPHS_JSON_RE);
    if (!jsonMatch) return null;
    parsed = JSON.parse(jsonMatch[0]) as { paragraphs?: JsonParagraphRow[] };
  } catch {
    return null;
  }

  if (!parsed?.paragraphs || !Array.isArray(parsed.paragraphs) || parsed.paragraphs.length === 0) {
    return null;
  }

  const filtered = chunkContent
    ? filterJsonParagraphsToChunk(parsed.paragraphs, chunkContent)
    : parsed.paragraphs;
  if (filtered.length === 0) return null;

  const merged = mergeJsonParagraphsToMarkedText(filtered);
  return merged.trim() ? merged : null;
}

/**
 * Canonical Lab translated/draft text: unwrap translate JSON when present, else normalize like source.
 */
export function normalizeLabTranslatedText(text: string): string {
  if (!text.trim()) return text;
  const fromJson = tryParseTranslationParagraphsJson(text);
  if (fromJson) return fromJson;
  return normalizeLabSourceText(text);
}
