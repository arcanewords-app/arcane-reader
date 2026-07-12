import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { transformGlossaryEntryToDB, transformGlossaryEntryForCloneInsert } from './glossary.js';

describe('glossary transforms', () => {
  it('transformGlossaryEntryToDB normalizes type and gender', () => {
    const row = transformGlossaryEntryToDB(
      {
        type: 'character',
        original: 'Alice',
        translated: 'Алиса',
        gender: 'female',
      },
      { projectId: 'p1' }
    );
    assert.equal(row.project_id, 'p1');
    assert.equal(row.type, 'character');
    assert.equal(row.gender, 'female');
  });

  it('transformGlossaryEntryForCloneInsert omits related ids', () => {
    const row = transformGlossaryEntryForCloneInsert(
      {
        id: 'old-id',
        type: 'term',
        original: 'magic',
        translated: 'магия',
        autoDetected: true,
      },
      'new-proj'
    );
    assert.equal(row.project_id, 'new-proj');
    assert.equal(row.auto_detected, true);
    assert.equal(row.related_entry_ids, undefined);
  });
});
