/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  formatReportPrefill,
  getReadingSelectionToolbarPosition,
  getReadingSelectionToolbarSize,
  isNodeInside,
  READING_SELECTION_TOOLBAR_BUTTON_SIZE,
  READING_SELECTION_TOOLBAR_GAP,
  READING_SELECTION_TOOLBAR_PADDING,
  REPORT_DESCRIPTION_MAX_LENGTH,
} from './readingSelection.js';

describe('readingSelection', () => {
  it('formatReportPrefill wraps text with guillemets and spacing', () => {
    assert.equal(formatReportPrefill('hello'), '«hello»\n\n');
  });

  it('truncates prefill to max report length', () => {
    const long = 'x'.repeat(REPORT_DESCRIPTION_MAX_LENGTH);
    const formatted = formatReportPrefill(long);
    assert.ok(formatted.length <= REPORT_DESCRIPTION_MAX_LENGTH);
  });

  it('isNodeInside detects contained nodes', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    container.appendChild(child);
    assert.equal(isNodeInside(container, child), true);
    assert.equal(isNodeInside(container, document.createElement('p')), false);
  });

  it('getReadingSelectionToolbarSize computes pill dimensions', () => {
    assert.deepEqual(getReadingSelectionToolbarSize(0), { width: 0, height: 0 });
    assert.deepEqual(getReadingSelectionToolbarSize(1), {
      width: READING_SELECTION_TOOLBAR_PADDING * 2 + READING_SELECTION_TOOLBAR_BUTTON_SIZE,
      height: READING_SELECTION_TOOLBAR_PADDING * 2 + READING_SELECTION_TOOLBAR_BUTTON_SIZE,
    });
    assert.deepEqual(getReadingSelectionToolbarSize(2), {
      width:
        READING_SELECTION_TOOLBAR_PADDING * 2 +
        READING_SELECTION_TOOLBAR_BUTTON_SIZE * 2 +
        READING_SELECTION_TOOLBAR_GAP,
      height: READING_SELECTION_TOOLBAR_PADDING * 2 + READING_SELECTION_TOOLBAR_BUTTON_SIZE,
    });
  });

  it('getReadingSelectionToolbarPosition prefers above when space allows', () => {
    const rect = {
      left: 100,
      top: 200,
      right: 200,
      bottom: 220,
      width: 100,
      height: 20,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect;
    const toolbarSize = getReadingSelectionToolbarSize(1);

    const position = getReadingSelectionToolbarPosition(rect, toolbarSize, {
      gap: 8,
      edgePadding: 8,
      viewport: { left: 0, top: 0, width: 400, height: 800 },
    });

    assert.equal(position.placement, 'above');
    assert.equal(position.top, rect.top - 8 - toolbarSize.height);
    assert.equal(position.left, rect.left + rect.width / 2 - toolbarSize.width / 2);
  });

  it('getReadingSelectionToolbarPosition falls back below near top edge', () => {
    const rect = {
      left: 100,
      top: 20,
      right: 200,
      bottom: 40,
      width: 100,
      height: 20,
      x: 100,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect;
    const toolbarSize = getReadingSelectionToolbarSize(1);

    const position = getReadingSelectionToolbarPosition(rect, toolbarSize, {
      gap: 8,
      edgePadding: 8,
      viewport: { left: 0, top: 0, width: 400, height: 800 },
    });

    assert.equal(position.placement, 'below');
    assert.equal(position.top, rect.bottom + 8);
  });

  it('getReadingSelectionToolbarPosition clamps horizontally in narrow viewport', () => {
    const rect = {
      left: 10,
      top: 200,
      right: 60,
      bottom: 220,
      width: 50,
      height: 20,
      x: 10,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect;
    const toolbarSize = getReadingSelectionToolbarSize(2);

    const position = getReadingSelectionToolbarPosition(rect, toolbarSize, {
      gap: 8,
      edgePadding: 8,
      viewport: { left: 0, top: 0, width: 120, height: 800 },
    });

    assert.equal(position.left, 8);
  });
});
