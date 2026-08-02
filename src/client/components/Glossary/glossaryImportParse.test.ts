import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { GlossaryEntry } from '../../types.js';
import { countNewImportRows, parseImportPreviewText } from './glossaryImportParse.js';

const existing: GlossaryEntry[] = [
  {
    id: '1',
    type: 'character',
    original: 'Alice',
    translated: 'Алиса',
  },
  {
    id: '2',
    type: 'term',
    original: 'Magic',
    translated: 'Магия',
  },
];

describe('parseImportPreviewText', () => {
  it('parses CSV with header row', () => {
    const csv = 'original,translated,type\nBob,Боб,character\nCity,Город,location\n';
    const { rows, parseError } = parseImportPreviewText(csv, 'glossary.csv');
    assert.equal(parseError, undefined);
    assert.deepEqual(rows, [
      { type: 'character', original: 'Bob' },
      { type: 'location', original: 'City' },
    ]);
  });

  it('parses JSON array of entries', () => {
    const json = JSON.stringify([
      { original: 'Dragon', type: 'term' },
      { original: 'Eve', type: 'character' },
    ]);
    const { rows, parseError } = parseImportPreviewText(json, 'glossary.json');
    assert.equal(parseError, undefined);
    assert.deepEqual(rows, [
      { type: 'term', original: 'Dragon' },
      { type: 'character', original: 'Eve' },
    ]);
  });
});

describe('countNewImportRows', () => {
  it('skips duplicates within import and against existing entries', () => {
    const rows = [
      { type: 'character' as const, original: 'Alice' },
      { type: 'character' as const, original: 'Alice' },
      { type: 'term' as const, original: 'NewTerm' },
      { type: 'term' as const, original: 'Magic' },
    ];
    const result = countNewImportRows(rows, existing);
    assert.deepEqual(result, { total: 4, newCount: 1, skipped: 3 });
  });
});
