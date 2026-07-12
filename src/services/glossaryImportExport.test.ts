import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { GlossaryEntry } from '../storage/database.js';
import {
  buildGlossaryCsvExport,
  buildGlossaryJsonExport,
  filterNewGlossaryEntries,
  glossaryEntryKey,
  parseGlossaryImportFile,
  toPortableGlossaryEntry,
} from './glossaryImportExport.js';

vi.mock('./engine-integration.js', () => ({
  getNameDeclensions: vi.fn().mockReturnValue({
    translatedName: 'Иван',
    declensions: { nominative: 'Иван' },
  }),
}));

describe('glossaryImportExport', () => {
  it('glossaryEntryKey normalizes type and original', () => {
    assert.equal(glossaryEntryKey('term', '  Magic '), 'term:Magic');
  });

  it('toPortableGlossaryEntry omits empty optional fields', () => {
    const portable = toPortableGlossaryEntry({
      id: 'g1',
      type: 'term',
      original: 'A',
      translated: 'B',
    } as GlossaryEntry);
    assert.deepEqual(portable, { type: 'term', original: 'A', translated: 'B' });
  });

  it('buildGlossaryJsonExport wraps entries in arcane format', () => {
    const json = buildGlossaryJsonExport([
      { id: 'g1', type: 'term', original: 'A', translated: 'B' } as GlossaryEntry,
    ]);
    const parsed = JSON.parse(json) as { format: string; entries: unknown[] };
    assert.equal(parsed.format, 'arcane-glossary');
    assert.equal(parsed.entries.length, 1);
  });

  it('buildGlossaryCsvExport includes BOM and header', () => {
    const buf = buildGlossaryCsvExport([
      { id: 'g1', type: 'term', original: 'A', translated: 'B' } as GlossaryEntry,
    ]);
    const text = buf.toString('utf-8');
    assert.match(text, /^\uFEFForiginal,translated,type/);
    assert.match(text, /A,B,term/);
  });

  it('filterNewGlossaryEntries skips duplicates in file and existing glossary', () => {
    const existing = [{ id: 'g1', type: 'term' as const, original: 'A', translated: 'B' }];
    const { toInsert, skipped } = filterNewGlossaryEntries(
      [
        { original: 'A', translated: 'B', type: 'term' },
        { original: 'A', translated: 'B2', type: 'term' },
        { original: 'C', translated: 'D', type: 'term' },
      ],
      existing
    );
    assert.equal(toInsert.length, 1);
    assert.equal(toInsert[0].original, 'C');
    assert.equal(skipped, 2);
  });

  it('parseGlossaryImportFile parses CSV rows', () => {
    const csv = 'original,translated,type\nMagic,Магия,term\n';
    const result = parseGlossaryImportFile(Buffer.from(csv, 'utf-8'), 'import.csv');
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].original, 'Magic');
    assert.equal(result.errors.length, 0);
  });
});
