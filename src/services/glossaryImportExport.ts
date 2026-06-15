import { parse } from 'csv-parse/sync';
import type { GlossaryImportEntry, GlossaryCreateBody } from '../api/schemas/glossary.js';
import { glossaryImportEntrySchema } from '../api/schemas/glossary.js';
import { getNameDeclensions } from './engine-integration.js';
import type { GlossaryEntry } from '../storage/database.js';

export const GLOSSARY_IMPORT_MAX_ENTRIES = 2000;

export type GlossaryExportPortableEntry = {
  type: GlossaryEntry['type'];
  original: string;
  translated: string;
  gender?: GlossaryEntry['gender'];
  description?: string;
  notes?: string;
  declensions?: GlossaryEntry['declensions'];
};

export type GlossaryImportParseError = {
  row: number;
  original?: string;
  message: string;
};

export type GlossaryImportParseResult = {
  entries: GlossaryImportEntry[];
  errors: GlossaryImportParseError[];
};

export type GlossaryImportResult = {
  added: number;
  skipped: number;
  errors: GlossaryImportParseError[];
};

export function glossaryEntryKey(type: GlossaryEntry['type'], original: string): string {
  return `${type}:${original.trim()}`;
}

export function toPortableGlossaryEntry(entry: GlossaryEntry): GlossaryExportPortableEntry {
  const portable: GlossaryExportPortableEntry = {
    type: entry.type,
    original: entry.original,
    translated: entry.translated,
  };
  if (entry.gender) portable.gender = entry.gender;
  if (entry.description) portable.description = entry.description;
  if (entry.notes) portable.notes = entry.notes;
  if (entry.declensions) portable.declensions = entry.declensions;
  return portable;
}

export function buildGlossaryJsonExport(entries: GlossaryEntry[]): string {
  const payload = {
    format: 'arcane-glossary' as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map(toPortableGlossaryEntry),
  };
  return JSON.stringify(payload, null, 2);
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildGlossaryCsvExport(entries: GlossaryEntry[]): Buffer {
  const header = 'original,translated,type,gender,description,notes';
  const lines = entries.map((entry) => {
    const portable = toPortableGlossaryEntry(entry);
    return [
      escapeCsvField(portable.original),
      escapeCsvField(portable.translated),
      escapeCsvField(portable.type),
      escapeCsvField(portable.gender ?? ''),
      escapeCsvField(portable.description ?? ''),
      escapeCsvField(portable.notes ?? ''),
    ].join(',');
  });
  const csv = [header, ...lines].join('\r\n');
  return Buffer.from('\uFEFF' + csv, 'utf-8');
}

function normalizeImportRow(
  row: Record<string, unknown>,
  rowIndex: number
): { entry?: GlossaryImportEntry; error?: GlossaryImportParseError } {
  const getString = (key: string): string | undefined => {
    const val = row[key];
    if (val === undefined || val === null) return undefined;
    return String(val).trim();
  };

  const original = getString('original');
  if (!original) {
    return {
      error: {
        row: rowIndex,
        message: 'original is required',
      },
    };
  }

  const typeRaw = getString('type');
  const genderRaw = getString('gender');

  const candidate: Record<string, unknown> = {
    original,
    translated: getString('translated'),
    type: typeRaw || undefined,
    gender: genderRaw || undefined,
    description: getString('description'),
    notes: getString('notes'),
  };

  const parsed = glossaryImportEntrySchema.safeParse(candidate);
  if (!parsed.success) {
    const message = Object.values(parsed.error.flatten().fieldErrors).flat().join('; ');
    return {
      error: {
        row: rowIndex,
        original,
        message: message || 'Validation failed',
      },
    };
  }

  return { entry: parsed.data };
}

function dedupeImportEntries(entries: GlossaryImportEntry[]): {
  unique: GlossaryImportEntry[];
  skippedInFile: number;
} {
  const seen = new Set<string>();
  const unique: GlossaryImportEntry[] = [];
  let skippedInFile = 0;

  for (const entry of entries) {
    const key = glossaryEntryKey(entry.type ?? 'term', entry.original);
    if (seen.has(key)) {
      skippedInFile++;
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }

  return { unique, skippedInFile };
}

export function filterNewGlossaryEntries(
  entries: GlossaryImportEntry[],
  existing: GlossaryEntry[]
): { toInsert: GlossaryImportEntry[]; skipped: number } {
  const existingKeys = new Set(existing.map((e) => glossaryEntryKey(e.type, e.original)));
  const { unique, skippedInFile } = dedupeImportEntries(entries);

  const toInsert: GlossaryImportEntry[] = [];
  let skipped = skippedInFile;

  for (const entry of unique) {
    const key = glossaryEntryKey(entry.type ?? 'term', entry.original);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    toInsert.push(entry);
  }

  return { toInsert, skipped };
}

export function prepareGlossaryEntryForInsert(
  entry: GlossaryImportEntry | GlossaryCreateBody
): Omit<GlossaryEntry, 'id'> {
  const { declensions: declensionsIn, translated: translatedIn, ...rest } = entry;
  let declensions = declensionsIn;
  let translated = translatedIn;
  const type = rest.type ?? 'term';

  if (type === 'character' && rest.original && !declensions) {
    const result = getNameDeclensions(rest.original, rest.gender || 'unknown');
    if (!translated) {
      translated = result.translatedName;
    }
    declensions = result.declensions;
  }

  return {
    ...rest,
    type,
    translated: translated ?? rest.original,
    declensions,
  };
}

function parseGlossaryJson(buffer: Buffer): GlossaryImportParseResult {
  const errors: GlossaryImportParseError[] = [];
  let raw: unknown;

  try {
    raw = JSON.parse(buffer.toString('utf-8'));
  } catch {
    return {
      entries: [],
      errors: [{ row: 0, message: 'Invalid JSON' }],
    };
  }

  let rows: unknown[];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { entries?: unknown }).entries)
  ) {
    rows = (raw as { entries: unknown[] }).entries;
  } else {
    return {
      entries: [],
      errors: [{ row: 0, message: 'Expected JSON array or { entries: [...] }' }],
    };
  }

  const entries: GlossaryImportEntry[] = [];
  rows.forEach((row, index) => {
    const rowIndex = index + 1;
    if (!row || typeof row !== 'object') {
      errors.push({ row: rowIndex, message: 'Entry must be an object' });
      return;
    }
    const result = normalizeImportRow(row as Record<string, unknown>, rowIndex);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    if (result.entry) {
      entries.push(result.entry);
    }
  });

  return { entries, errors };
}

function parseGlossaryCsv(buffer: Buffer): GlossaryImportParseResult {
  const errors: GlossaryImportParseError[] = [];
  const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '');

  let records: Record<string, string>[];
  try {
    records = parse(raw, {
      columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV parse error';
    return {
      entries: [],
      errors: [{ row: 0, message }],
    };
  }

  if (records.length === 0) {
    return {
      entries: [],
      errors: [{ row: 0, message: 'CSV file has no data rows' }],
    };
  }

  const entries: GlossaryImportEntry[] = [];
  records.forEach((record, index) => {
    const rowIndex = index + 2;
    const result = normalizeImportRow(record, rowIndex);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    if (result.entry) {
      entries.push(result.entry);
    }
  });

  return { entries, errors };
}

export function parseGlossaryImportFile(
  buffer: Buffer,
  filename: string
): GlossaryImportParseResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    return parseGlossaryCsv(buffer);
  }
  if (lower.endsWith('.json')) {
    return parseGlossaryJson(buffer);
  }
  return {
    entries: [],
    errors: [{ row: 0, message: 'Unsupported file type. Use .json or .csv' }],
  };
}
