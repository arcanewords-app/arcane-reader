/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { mergeSegmentsWithUnclosedBlocks, renderTextWithBlocks } from './text-blocks.js';

const noteType = {
  id: 'note',
  name: 'Note',
  description: 'Aside',
  enabled: true,
  htmlTag: 'aside' as const,
  cssClass: 'note',
  isInline: false,
};

describe('text-blocks', () => {
  it('returns empty string for non-string input', () => {
    assert.equal(renderTextWithBlocks('', []), '');
    assert.equal(renderTextWithBlocks(null as unknown as string, []), '');
  });

  it('escapes plain text when no block types enabled', () => {
    const html = renderTextWithBlocks('Hello <b>world</b>\nnext', []);
    assert.match(html, /&lt;b&gt;/);
    assert.match(html, /<br>/);
    assert.equal(html.includes('{{block:'), false);
  });

  it('renders block marker content without raw markers', () => {
    const html = renderTextWithBlocks('{{block:note}}Aside{{/block:note}}', [noteType]);
    assert.match(html, /Aside/);
    assert.equal(html.includes('{{block:'), false);
  });

  it('escapes unknown block type content and keeps known block body', () => {
    const html = renderTextWithBlocks(
      'before {{block:note}}Body{{/block:note}} {{block:unknown}}X{{/block:unknown}}',
      [noteType]
    );
    assert.match(html, /Body/);
    assert.match(html, /X/);
    assert.equal(html.includes('{{block:'), false);
  });

  it('mergeSegmentsWithUnclosedBlocks merges open markers across paragraphs', () => {
    const merged = mergeSegmentsWithUnclosedBlocks(
      'Intro\n\n{{block:note}}part one\n\npart two{{/block:note}}\n\nOutro'
    );
    assert.ok(merged.some((s) => s.includes('part one') && s.includes('part two')));
    assert.ok(merged.includes('Intro'));
    assert.ok(merged.includes('Outro'));
  });

  it('mergeSegmentsWithUnclosedBlocks splits dash dialogue lines when single segment', () => {
    const text = '— Hello\n— World';
    const merged = mergeSegmentsWithUnclosedBlocks(text);
    assert.ok(merged.length >= 2);
  });

  it('mergeSegmentsWithUnclosedBlocks returns empty for blank input', () => {
    assert.deepEqual(mergeSegmentsWithUnclosedBlocks('   \n\n  '), []);
  });
});
