import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { remapPrimaryLocationId, remapRelatedEntryIds } from './glossaryCloneRemap.js';

describe('glossaryCloneRemap', () => {
  const idMap = new Map([
    ['old-a', 'new-a'],
    ['old-b', 'new-b'],
    ['old-loc', 'new-loc'],
  ]);

  it('remaps related entry ids and drops unknown', () => {
    assert.deepEqual(remapRelatedEntryIds(idMap, ['old-a', 'missing', 'old-b']), [
      'new-a',
      'new-b',
    ]);
    assert.equal(remapRelatedEntryIds(idMap, ['missing']), undefined);
    assert.equal(remapRelatedEntryIds(idMap, undefined), undefined);
  });

  it('remaps primary location id', () => {
    assert.equal(remapPrimaryLocationId(idMap, 'old-loc'), 'new-loc');
    assert.equal(remapPrimaryLocationId(idMap, 'missing'), undefined);
    assert.equal(remapPrimaryLocationId(idMap, undefined), undefined);
  });
});
