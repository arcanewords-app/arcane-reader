/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { applyHighlightsToContainer, unwrapHighlightMarks } from './readingHighlightRender.js';
import type { StoredHighlight } from './readingHighlightsStorage.js';

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

describe('readingHighlightRender', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies a single-paragraph highlight mark', () => {
    const container = buildReadingContainer(['Hello world']);
    const highlight: StoredHighlight = {
      id: 'h1',
      sp: 0,
      so: 0,
      ep: 0,
      eo: 5,
    };

    applyHighlightsToContainer(container, [highlight]);

    const marks = container.querySelectorAll('.reader-highlight');
    assert.equal(marks.length, 1);
    assert.equal(marks[0]?.textContent, 'Hello');
  });

  it('unwraps existing highlight marks before re-applying', () => {
    const container = buildReadingContainer(['Hello world']);
    const highlight: StoredHighlight = {
      id: 'h1',
      sp: 0,
      so: 6,
      ep: 0,
      eo: 11,
    };

    applyHighlightsToContainer(container, [highlight]);
    assert.equal(container.querySelectorAll('.reader-highlight').length, 1);

    unwrapHighlightMarks(container);
    assert.equal(container.querySelectorAll('.reader-highlight').length, 0);
    assert.match(container.textContent ?? '', /Hello world/);
  });

  it('splits multi-paragraph highlights into segment marks', () => {
    const container = buildReadingContainer(['Alpha text', 'Beta text', 'Gamma text']);
    const highlight: StoredHighlight = {
      id: 'h2',
      sp: 0,
      so: 6,
      ep: 2,
      eo: 5,
    };

    applyHighlightsToContainer(container, [highlight]);

    const marks = container.querySelectorAll('.reader-highlight');
    assert.ok(marks.length >= 2);
    assert.ok([...marks].some((m) => (m.textContent ?? '').includes('text')));
  });
});
