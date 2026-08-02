import type { GlossaryEntry, GlossaryEntryType } from '../../types.js';

export type ImportPreviewRow = { type: GlossaryEntryType; original: string };

export function glossaryDupKey(type: GlossaryEntryType, original: string): string {
  return `${type}:${original.trim()}`;
}

export function parseCsvLineSimple(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseImportPreviewText(
  text: string,
  filename: string
): { rows: ImportPreviewRow[]; parseError?: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    try {
      const raw = JSON.parse(text) as unknown;
      const arr = Array.isArray(raw) ? raw : (raw as { entries?: unknown })?.entries;
      if (!Array.isArray(arr)) {
        return { rows: [], parseError: 'Invalid JSON structure' };
      }
      const rows: ImportPreviewRow[] = [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const original = String(o.original ?? '').trim();
        if (!original) continue;
        const typeRaw = String(o.type ?? 'term');
        const type = (
          ['character', 'location', 'term'].includes(typeRaw) ? typeRaw : 'term'
        ) as GlossaryEntryType;
        rows.push({ type, original });
      }
      return { rows };
    } catch {
      return { rows: [], parseError: 'Invalid JSON' };
    }
  }
  if (lower.endsWith('.csv')) {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    if (lines.length === 0) {
      return { rows: [], parseError: 'Empty CSV' };
    }
    const header = lines[0].toLowerCase();
    const startIdx = header.includes('original') ? 1 : 0;
    const rows: ImportPreviewRow[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = parseCsvLineSimple(lines[i]);
      const original = (cols[0] ?? '').trim();
      if (!original) continue;
      const typeRaw = (cols[2] ?? 'term').trim();
      const type = (
        ['character', 'location', 'term'].includes(typeRaw) ? typeRaw : 'term'
      ) as GlossaryEntryType;
      rows.push({ type, original });
    }
    return { rows };
  }
  return { rows: [], parseError: 'Unsupported file type' };
}

export function countNewImportRows(
  rows: ImportPreviewRow[],
  existing: GlossaryEntry[]
): { total: number; newCount: number; skipped: number } {
  const existingKeys = new Set(existing.map((e) => glossaryDupKey(e.type, e.original)));
  const seen = new Set<string>();
  let newCount = 0;
  let skipped = 0;
  for (const row of rows) {
    const key = glossaryDupKey(row.type, row.original);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    if (existingKeys.has(key)) {
      skipped++;
    } else {
      newCount++;
    }
  }
  return { total: rows.length, newCount, skipped };
}
