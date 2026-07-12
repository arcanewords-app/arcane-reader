/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { renderTextWithBlocks } from './text-blocks.js';

describe('text-blocks', () => {
  it('escapes plain text when no block types enabled', () => {
    const html = renderTextWithBlocks('Hello <b>world</b>', []);
    assert.match(html, /&lt;b&gt;/);
    assert.equal(html.includes('{{block:'), false);
  });

  it('renders block marker content without raw markers', () => {
    const html = renderTextWithBlocks('{{block:note}}Aside{{/block:note}}', [
      {
        id: 'note',
        name: 'Note',
        description: 'Aside',
        enabled: true,
        htmlTag: 'aside',
        cssClass: 'note',
        isInline: false,
      },
    ]);
    assert.match(html, /Aside/);
    assert.equal(html.includes('{{block:'), false);
  });
});
