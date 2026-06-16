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

/**
 * Inject --para:{id}-- markers when absent. Skips paragraphs that already start with a marker.
 */
export function injectParagraphMarkers(text: string, ids?: string[]): string {
  if (!text.trim()) return text;
  if (textHasParagraphMarkers(text)) {
    return text;
  }

  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) return text;

  return paragraphs
    .map((para, i) => {
      if (para.startsWith(PARA_MARKER_PREFIX)) return para;
      const id = ids?.[i] ?? `auto_${i}`;
      return `${PARA_MARKER_PREFIX}${id}${PARA_MARKER_SUFFIX}${para}`;
    })
    .join('\n\n');
}

export function stripParagraphMarkers(text: string): string {
  return text.replace(/--para:[^\n]*?--/g, '').trim();
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
 * Split text into display paragraphs: use marker ids when present, else split by blank lines.
 */
export function textToDisplayParagraphs(text: string): { id?: string; text: string }[] {
  if (!text.trim()) return [];

  if (textHasParagraphMarkers(text)) {
    const parsed = parseParagraphMarkers(text);
    if (parsed.length > 0) {
      return parsed.map((p) => ({ id: p.id, text: p.text }));
    }
  }

  return splitIntoParagraphs(text).map((p, i) => ({ id: `auto_${i}`, text: p }));
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
