/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  formatReportPrefill,
  isNodeInside,
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
});
