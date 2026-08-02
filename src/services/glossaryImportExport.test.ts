import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import type { GlossaryEntry } from '../storage/database.js';
import {
  buildGlossaryCsvExport,
  buildGlossaryJsonExport,
  filterNewGlossaryEntries,
  glossaryEntryKey,
  parseGlossaryImportFile,
  prepareGlossaryEntryForInsert,
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

  it('parseGlossaryImportFile parses JSON array and wrapped entries', () => {
    const arr = parseGlossaryImportFile(
      Buffer.from(JSON.stringify([{ original: 'A', translated: 'B', type: 'term' }]), 'utf-8'),
      'g.json'
    );
    assert.equal(arr.entries.length, 1);

    const wrapped = parseGlossaryImportFile(
      Buffer.from(
        JSON.stringify({
          format: 'arcane-glossary',
          entries: [{ original: 'C', translated: 'D', type: 'location' }],
        }),
        'utf-8'
      ),
      'g.json'
    );
    assert.equal(wrapped.entries[0]?.type, 'location');
  });

  it('parseGlossaryImportFile reports JSON and unsupported format errors', () => {
    const badJson = parseGlossaryImportFile(Buffer.from('{', 'utf-8'), 'bad.json');
    assert.ok(badJson.errors.some((e) => /Invalid JSON/.test(e.message)));

    const badShape = parseGlossaryImportFile(
      Buffer.from(JSON.stringify({ foo: 1 }), 'utf-8'),
      'bad.json'
    );
    assert.ok(badShape.errors.some((e) => /Expected JSON/.test(e.message)));

    const unsupported = parseGlossaryImportFile(Buffer.from('x'), 'file.txt');
    assert.ok(unsupported.errors.length >= 1);

    const emptyCsv = parseGlossaryImportFile(
      Buffer.from('original,translated,type\n', 'utf-8'),
      'empty.csv'
    );
    assert.ok(emptyCsv.errors.some((e) => /no data rows/.test(e.message)));
  });

  it('prepareGlossaryEntryForInsert fills character declensions', () => {
    const prepared = prepareGlossaryEntryForInsert({
      type: 'character',
      original: 'John',
      gender: 'male',
    });
    assert.equal(prepared.type, 'character');
    assert.equal(prepared.translated, 'Иван');
    assert.ok(prepared.declensions);
  });

  it('toPortableGlossaryEntry keeps optional fields when present', () => {
    const portable = toPortableGlossaryEntry({
      id: 'g1',
      type: 'character',
      original: 'A',
      translated: 'B',
      description: 'desc',
      notes: 'n',
      gender: 'female',
      declensions: { nominative: 'B' } as never,
    } as GlossaryEntry);
    assert.equal(portable.description, 'desc');
    assert.equal(portable.notes, 'n');
    assert.equal(portable.gender, 'female');
    assert.ok(portable.declensions);
  });
});
