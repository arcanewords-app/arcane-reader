import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { convertMarkersToHtml, stripBlockMarkers, validateBlockMarkers } from './text-blocks.js';
import { DEFAULT_TEXT_BLOCK_TYPES } from '../constants/text-block-presets.js';

describe('text-blocks', () => {
  it('validateBlockMarkers accepts balanced markers', () => {
    const result = validateBlockMarkers('{{block:note}}text{{/block:note}}', ['note']);
    assert.equal(result.valid, true);
  });

  it('validateBlockMarkers reports unclosed markers', () => {
    const result = validateBlockMarkers('{{block:note}}text', ['note']);
    assert.equal(result.valid, false);
    assert.ok(result.warnings.length > 0);
  });

  it('stripBlockMarkers removes markers but keeps inner text', () => {
    assert.equal(stripBlockMarkers('{{block:note}}inner{{/block:note}}'), 'inner');
  });

  it('convertMarkersToHtml wraps content in span', () => {
    const noteType = DEFAULT_TEXT_BLOCK_TYPES.find((t) => t.id === 'note')!;
    const html = convertMarkersToHtml('{{block:note}}inner{{/block:note}}', [noteType]);
    assert.match(html, /inner/);
    assert.match(html, /class="note"/);
  });
});
