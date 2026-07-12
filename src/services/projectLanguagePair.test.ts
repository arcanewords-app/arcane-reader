import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isProjectLanguagePairLocked } from './projectLanguagePair.js';

describe('isProjectLanguagePairLocked', () => {
  it('is false for empty glossary and all pending chapters', () => {
    assert.equal(
      isProjectLanguagePairLocked({ glossary: [], chapters: [{ status: 'pending' } as never] }),
      false
    );
  });

  it('is true when glossary has entries', () => {
    assert.equal(
      isProjectLanguagePairLocked({
        glossary: [{ id: 'g1' } as never],
        chapters: [{ status: 'pending' } as never],
      }),
      true
    );
  });

  it('is true when any chapter is not pending', () => {
    assert.equal(
      isProjectLanguagePairLocked({
        glossary: [],
        chapters: [{ status: 'pending' } as never, { status: 'completed' } as never],
      }),
      true
    );
  });
});
