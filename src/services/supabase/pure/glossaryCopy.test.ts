import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { GlossaryEntry } from '../../../storage/database.js';
import {
  buildGlossaryCloneInsertRows,
  buildGlossaryIdMapFromExisting,
  buildGlossaryTransferInsertRows,
  CLONE_GLOSSARY_BATCH_SIZE,
} from './glossaryCopy.js';

function makeEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: 'g1',
    type: 'character',
    original: 'Alice',
    translated: 'Алиса',
    gender: 'female',
    mentionedInChapters: [1, 2],
    imageUrls: ['https://example.com/a.png'],
    ...overrides,
  } as GlossaryEntry;
}

describe('glossaryCopy', () => {
  it('CLONE_GLOSSARY_BATCH_SIZE is 100', () => {
    assert.equal(CLONE_GLOSSARY_BATCH_SIZE, 100);
  });

  it('buildGlossaryCloneInsertRows maps entries to insert rows', () => {
    const rows = buildGlossaryCloneInsertRows([makeEntry()], 'proj-target');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.project_id, 'proj-target');
    assert.equal(rows[0]?.original, 'Alice');
  });

  it('buildGlossaryTransferInsertRows remaps chapter numbers and copies translated', () => {
    const source = [makeEntry({ id: 'src-1', mentionedInChapters: [1, 2] })];
    const chapterMap = new Map([
      [1, 10],
      [2, 11],
    ]);
    const rows = buildGlossaryTransferInsertRows(
      [
        { type: 'character', original: 'Alice' } as Omit<GlossaryEntry, 'id'> & {
          translated?: string;
        },
      ],
      source,
      'proj-target',
      chapterMap
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.translated, 'Алиса');
    assert.deepEqual(rows[0]?.mentioned_in_chapters, [10, 11]);
  });

  it('buildGlossaryIdMapFromExisting maps source ids to target ids by key', () => {
    const source = [
      makeEntry({ id: 's1', original: 'Alice' }),
      makeEntry({ id: 's2', original: 'Bob', type: 'character' }),
    ];
    const target = [makeEntry({ id: 't1', original: 'Alice' })];
    const map = buildGlossaryIdMapFromExisting(source, target);
    assert.equal(map.get('s1'), 't1');
    assert.equal(map.has('s2'), false);
  });
});
