/**
 * SSOT for mapping paragraph ids → translated text.
 * Concatenates duplicate ids (LLM may split one paragraph into multiple JSON rows).
 */

export function normalizeParagraphKey(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('--para:') && trimmed.endsWith('--')) {
    return trimmed.slice(7, -2);
  }
  return trimmed.replace(/^--para:/, '').replace(/--$/, '');
}

export function hasDuplicateParagraphKeys(rows: Array<{ id: string }>): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = normalizeParagraphKey(row.id);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function getDuplicateParagraphKeys(rows: Array<{ id: string }>): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeParagraphKey(row.id);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

export interface MergedDuplicateInfo {
  paragraphId: string;
  partsCount: number;
}

export interface ParagraphTranslationMapResult {
  map: Map<string, string>;
  mergedDuplicates: MergedDuplicateInfo[];
}

/** Concat duplicate keys with \\n\\n; preserve first-seen order. */
export function buildParagraphTranslationMap(
  rows: Array<{ id: string; text: string }>
): ParagraphTranslationMapResult {
  const map = new Map<string, string>();
  const partsCount = new Map<string, number>();

  for (const row of rows) {
    const key = normalizeParagraphKey(row.id);
    const text = row.text.trim();
    if (!key || !text) continue;

    const existing = map.get(key);
    if (existing !== undefined) {
      map.set(key, `${existing}\n\n${text}`);
      partsCount.set(key, (partsCount.get(key) ?? 1) + 1);
    } else {
      map.set(key, text);
      partsCount.set(key, 1);
    }
  }

  const mergedDuplicates: MergedDuplicateInfo[] = [];
  for (const [paragraphId, count] of partsCount) {
    if (count > 1) {
      mergedDuplicates.push({ paragraphId, partsCount: count });
    }
  }

  return { map, mergedDuplicates };
}

/** Minimum translated/original length ratio below which truncation is suspected. */
export const SUSPECT_TRUNCATION_LENGTH_RATIO = 0.55;

export interface SuspectTruncationInput {
  id: string;
  originalText: string;
  translatedText?: string | null;
}

export interface SuspectTruncationResult {
  paragraphId: string;
  originalLength: number;
  translatedLength: number;
  ratio: number;
}

export function detectSuspectTruncations(
  paragraphs: SuspectTruncationInput[],
  minRatio: number = SUSPECT_TRUNCATION_LENGTH_RATIO
): SuspectTruncationResult[] {
  const SEPARATOR_PATTERN = /^[\s*\-_=~#]+$/;
  const suspects: SuspectTruncationResult[] = [];

  for (const p of paragraphs) {
    const original = (p.originalText ?? '').trim();
    if (!original || SEPARATOR_PATTERN.test(original)) continue;

    const translated = (p.translatedText ?? '').trim();
    if (!translated) continue;

    const originalLength = original.length;
    const translatedLength = translated.length;
    if (originalLength < 80) continue;

    const ratio = translatedLength / originalLength;
    if (ratio < minRatio) {
      suspects.push({
        paragraphId: p.id,
        originalLength,
        translatedLength,
        ratio,
      });
    }
  }

  return suspects;
}
