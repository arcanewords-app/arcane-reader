/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  anchorToRange,
  getAnchorFromSelection,
  normalizeAnchorRange,
  rangesOverlap,
} from './readingTextAnchors.js';

function buildReadingContainer(paragraphs: string[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'reading-mode-text';
  paragraphs.forEach((text, index) => {
    const paragraph = document.createElement('div');
    paragraph.className = 'reading-mode-paragraph';
    paragraph.dataset.paragraphIndex = String(index);
    paragraph.textContent = text;
    container.appendChild(paragraph);
  });
  document.body.appendChild(container);
  return container;
}

function selectText(
  container: HTMLElement,
  startParagraph: number,
  startOffset: number,
  endParagraph: number,
  endOffset: number
): void {
  const startEl = container.querySelector<HTMLElement>(
    `[data-paragraph-index="${startParagraph}"]`
  );
  const endEl = container.querySelector<HTMLElement>(`[data-paragraph-index="${endParagraph}"]`);
  assert.ok(startEl && endEl);
  const startNode = startEl.firstChild;
  const endNode = endEl.firstChild;
  assert.ok(startNode && endNode);

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  assert.ok(selection);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('readingTextAnchors', () => {
  it('rangesOverlap detects intersecting ranges', () => {
    assert.equal(
      rangesOverlap(
        { startParagraph: 0, startOffset: 2, endParagraph: 0, endOffset: 8 },
        { startParagraph: 0, startOffset: 5, endParagraph: 0, endOffset: 10 }
      ),
      true
    );
    assert.equal(
      rangesOverlap(
        { startParagraph: 0, startOffset: 2, endParagraph: 0, endOffset: 4 },
        { startParagraph: 0, startOffset: 5, endParagraph: 0, endOffset: 10 }
      ),
      false
    );
  });

  it('anchorToRange orders positions across paragraphs', () => {
    const start = anchorToRange({
      startParagraph: 1,
      startOffset: 2,
      endParagraph: 2,
      endOffset: 4,
    });
    const before = anchorToRange({
      startParagraph: 0,
      startOffset: 99,
      endParagraph: 0,
      endOffset: 100,
    });
    assert.ok(start.start > before.end);
  });

  it('getAnchorFromSelection maps DOM selection to anchor', () => {
    const container = buildReadingContainer(['Hello world', 'Second paragraph']);
    selectText(container, 0, 6, 0, 11);

    const anchor = getAnchorFromSelection(container, {
      publicationId: 'pub-1',
      chapterId: 'ch-1',
      chapterNumber: 3,
    });

    assert.deepEqual(anchor, {
      publicationId: 'pub-1',
      chapterId: 'ch-1',
      chapterNumber: 3,
      startParagraph: 0,
      startOffset: 6,
      endParagraph: 0,
      endOffset: 11,
    });

    container.remove();
  });

  it('normalizeAnchorRange swaps backward offsets', () => {
    const normalized = normalizeAnchorRange(0, 11, 0, 6);
    assert.deepEqual(normalized, {
      startParagraph: 0,
      startOffset: 6,
      endParagraph: 0,
      endOffset: 11,
    });
  });
});
