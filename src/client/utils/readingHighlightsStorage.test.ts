/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vitest';
import {
  countTotalHighlights,
  enforceTotalCap,
  HIGHLIGHTS_STORAGE_KEY,
  HIGHLIGHTS_TOTAL_MAX,
  loadHighlights,
  removeOldestHighlight,
  toggleHighlightForRange,
} from './readingHighlightsStorage.js';

describe('readingHighlightsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggleHighlightForRange adds and removes highlight', async () => {
    const range = {
      startParagraph: 0,
      startOffset: 2,
      endParagraph: 0,
      endOffset: 8,
    };

    const added = toggleHighlightForRange('user-1', 'pub-1', 'ch-1', range, 'sample');
    assert.equal(added.added, true);
    assert.equal(added.storageFull, false);
    assert.equal(added.highlights.length, 1);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const removed = toggleHighlightForRange('user-1', 'pub-1', 'ch-1', range, 'sample');
    assert.equal(removed.added, false);
    assert.equal(removed.storageFull, false);
    assert.equal(removed.highlights.length, 0);
    assert.equal(loadHighlights('user-1', 'pub-1', 'ch-1').length, 0);
  });

  it('stores highlights for the active user account', async () => {
    toggleHighlightForRange(
      'user-1',
      'pub-1',
      'ch-1',
      { startParagraph: 0, startOffset: 0, endParagraph: 0, endOffset: 3 },
      'one'
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    toggleHighlightForRange(
      'user-2',
      'pub-1',
      'ch-1',
      { startParagraph: 1, startOffset: 0, endParagraph: 1, endOffset: 3 },
      'two'
    );

    assert.equal(loadHighlights('user-2', 'pub-1', 'ch-1').length, 1);
    assert.equal(loadHighlights('user-1', 'pub-1', 'ch-1').length, 0);
    assert.match(window.localStorage.getItem(HIGHLIGHTS_STORAGE_KEY) ?? '', /"userId":"user-2"/);
  });

  it('enforceTotalCap drops oldest highlights globally', () => {
    const store = {
      schemaVersion: 1,
      userId: 'user-1',
      pubs: {
        'pub-a': {
          'ch-1': [{ id: 'old', sp: 0, so: 0, ep: 0, eo: 1 }],
          'ch-2': [{ id: 'keep-a', sp: 1, so: 0, ep: 1, eo: 1 }],
        },
        'pub-b': {
          'ch-9': [{ id: 'keep-b', sp: 2, so: 0, ep: 2, eo: 1 }],
        },
      },
    };

    assert.equal(countTotalHighlights(store), 3);
    assert.equal(removeOldestHighlight(store), true);
    assert.equal(countTotalHighlights(store), 2);
    assert.equal(store.pubs['pub-a']?.['ch-1'], undefined);
    assert.equal(enforceTotalCap(store, 1), true);
    assert.equal(countTotalHighlights(store), 1);
    assert.equal(store.pubs['pub-a']?.['ch-2'], undefined);
    assert.equal(store.pubs['pub-b']?.['ch-9']?.[0]?.id, 'keep-b');
  });

  it('toggleHighlightForRange evicts oldest when at global cap', () => {
    const store = {
      schemaVersion: 1,
      userId: 'user-1',
      pubs: {} as Record<
        string,
        Record<string, Array<{ id: string; sp: number; so: number; ep: number; eo: number }>>
      >,
    };

    for (let i = 0; i < HIGHLIGHTS_TOTAL_MAX; i++) {
      const pubId = `pub-${i % 2}`;
      const chId = `ch-${i % 3}`;
      if (!store.pubs[pubId]) store.pubs[pubId] = {};
      if (!store.pubs[pubId]![chId]) store.pubs[pubId]![chId] = [];
      store.pubs[pubId]![chId]!.push({
        id: `hl-${i}`,
        sp: 0,
        so: 0,
        ep: 0,
        eo: 1,
      });
    }

    window.localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(store));
    assert.equal(countTotalHighlights(store), HIGHLIGHTS_TOTAL_MAX);
    const oldestId = store.pubs['pub-0']!['ch-0']![0]!.id;

    const result = toggleHighlightForRange(
      'user-1',
      'pub-new',
      'ch-new',
      { startParagraph: 0, startOffset: 0, endParagraph: 0, endOffset: 5 },
      'new highlight'
    );

    assert.equal(result.added, true);
    assert.equal(result.storageFull, false);
    assert.equal(
      countTotalHighlights(JSON.parse(window.localStorage.getItem(HIGHLIGHTS_STORAGE_KEY)!)),
      HIGHLIGHTS_TOTAL_MAX
    );
    assert.equal(loadHighlights('user-1', 'pub-new', 'ch-new').length, 1);
    assert.equal(
      loadHighlights('user-1', 'pub-0', 'ch-0').some((item) => item.id === oldestId),
      false
    );
  });
});
