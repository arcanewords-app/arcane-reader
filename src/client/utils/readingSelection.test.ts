/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  clearBrowserSelection,
  formatReportPrefill,
  getReadingSelectionToolbarPosition,
  getReadingSelectionToolbarSize,
  getSelectionSnapshotInContainer,
  getSelectionTextInContainer,
  isNodeInside,
  READING_SELECTION_TOOLBAR_BUTTON_SIZE,
  READING_SELECTION_TOOLBAR_GAP,
  READING_SELECTION_TOOLBAR_PADDING,
  REPORT_DESCRIPTION_MAX_LENGTH,
} from './readingSelection.js';

describe('readingSelection', () => {
  it('formatReportPrefill wraps text with guillemets and spacing', () => {
    assert.equal(formatReportPrefill('hello'), '«hello»\n\n');
    assert.equal(formatReportPrefill('   '), '');
  });

  it('truncates prefill to max report length', () => {
    const long = 'x'.repeat(REPORT_DESCRIPTION_MAX_LENGTH);
    const formatted = formatReportPrefill(long);
    assert.ok(formatted.length <= REPORT_DESCRIPTION_MAX_LENGTH);
  });

  it('isNodeInside detects contained nodes', () => {
    const container = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'word';
    container.appendChild(child);
    assert.equal(isNodeInside(container, child), true);
    assert.equal(isNodeInside(container, child.firstChild), true);
    assert.equal(isNodeInside(container, document.createElement('p')), false);
    assert.equal(isNodeInside(container, null), false);
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

  it('uses the window size when no viewport is passed and clamps a toolbar below the fold', () => {
    const rect = {
      left: 10,
      top: 700,
      right: 60,
      bottom: 790,
      width: 50,
      height: 90,
      x: 10,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect;
    const toolbarSize = { width: 40, height: 40 };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });

    const position = getReadingSelectionToolbarPosition(rect, toolbarSize);
    assert.equal(position.placement, 'above');
    assert.ok(position.top <= 200 - toolbarSize.height);
  });

  it('reads a selection inside the container and ignores an empty or outside one', () => {
    const container = document.createElement('div');
    container.textContent = 'selected words';
    document.body.appendChild(container);

    const removeAllRanges = () => {};
    const collapsed = { isCollapsed: true, anchorNode: null, focusNode: null, toString: () => '' };
    const getSelection = (selection: unknown) => {
      Object.defineProperty(window, 'getSelection', {
        configurable: true,
        value: () => selection,
      });
    };

    getSelection(null);
    assert.equal(getSelectionSnapshotInContainer(container), null);
    clearBrowserSelection();

    getSelection(collapsed);
    assert.equal(getSelectionTextInContainer(container), null);
    clearBrowserSelection();

    const outside = document.createElement('p');
    getSelection({
      isCollapsed: false,
      anchorNode: outside,
      focusNode: outside,
      rangeCount: 0,
      toString: () => 'nope',
      removeAllRanges,
    });
    assert.equal(getSelectionSnapshotInContainer(container), null);

    getSelection({
      isCollapsed: false,
      anchorNode: container.firstChild,
      focusNode: container.firstChild,
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
      }),
      toString: () => 'selected words',
      removeAllRanges,
    });
    assert.equal(getSelectionSnapshotInContainer(container), null);

    const remove = { called: false };
    getSelection({
      isCollapsed: false,
      anchorNode: container.firstChild,
      focusNode: container.firstChild,
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ width: 20, height: 10 }),
      }),
      toString: () => `  ${'y'.repeat(REPORT_DESCRIPTION_MAX_LENGTH + 5)}  `,
      removeAllRanges: () => {
        remove.called = true;
      },
    });
    const snapshot = getSelectionSnapshotInContainer(container);
    assert.equal(snapshot?.wasTruncated, true);
    assert.equal(snapshot?.text.length, REPORT_DESCRIPTION_MAX_LENGTH);
    assert.equal(getSelectionTextInContainer(container), snapshot?.text);
    clearBrowserSelection();
    assert.equal(remove.called, true);

    container.remove();
  });
});
