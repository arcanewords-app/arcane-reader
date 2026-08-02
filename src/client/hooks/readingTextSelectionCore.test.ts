import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  SELECTION_DEBOUNCE_MS,
  mergeSelectionOnScroll,
  selectionStateFromSnapshot,
  shouldIgnoreDisabledSelection,
} from './readingTextSelectionCore.js';

describe('readingTextSelectionCore', () => {
  it('exports debounce constant', () => {
    assert.equal(SELECTION_DEBOUNCE_MS, 100);
  });

  it('maps snapshot to selection state', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 } as DOMRect;
    const state = selectionStateFromSnapshot({
      text: 'hello',
      rect,
      wasTruncated: true,
    });
    assert.deepEqual(state, { text: 'hello', rect, wasTruncated: true });
  });

  it('merges scroll updates preserving text when previous exists', () => {
    const prevRect = { x: 0, y: 0, width: 1, height: 1 } as DOMRect;
    const nextRect = { x: 9, y: 9, width: 2, height: 2 } as DOMRect;
    const merged = mergeSelectionOnScroll(
      { text: 'hello', rect: prevRect, wasTruncated: false },
      { text: 'ignored', rect: nextRect, wasTruncated: true }
    );
    assert.equal(merged.text, 'hello');
    assert.equal(merged.rect, nextRect);
    assert.equal(merged.wasTruncated, true);

    const created = mergeSelectionOnScroll(null, {
      text: 'new',
      rect: nextRect,
      wasTruncated: false,
    });
    assert.equal(created.text, 'new');
  });

  it('detects when selection sync should be ignored', () => {
    assert.equal(shouldIgnoreDisabledSelection(false, true), true);
    assert.equal(shouldIgnoreDisabledSelection(true, false), true);
    assert.equal(shouldIgnoreDisabledSelection(true, true), false);
  });
});
