import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_TEXT_BLOCK_TYPES } from './text-block-presets.js';

describe('DEFAULT_TEXT_BLOCK_TYPES', () => {
  it('contains expected built-in ids exactly once', () => {
    const ids = DEFAULT_TEXT_BLOCK_TYPES.map((t) => t.id);
    assert.deepEqual(ids, [
      'system-message',
      'note',
      'notification',
      'skill',
      'inner-voice',
      'letter',
    ]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('marks all presets enabled with non-empty metadata', () => {
    for (const preset of DEFAULT_TEXT_BLOCK_TYPES) {
      assert.equal(preset.enabled, true);
      assert.ok(preset.name.length > 0);
      assert.ok(preset.description.length > 0);
      assert.ok(preset.cssClass.length > 0);
      assert.ok(preset.htmlTag.length > 0);
      assert.ok(preset.icon);
    }
  });

  it('separates inline and block presets by htmlTag and isInline', () => {
    const inline = DEFAULT_TEXT_BLOCK_TYPES.filter((t) => t.isInline);
    const block = DEFAULT_TEXT_BLOCK_TYPES.filter((t) => !t.isInline);
    assert.deepEqual(
      inline.map((t) => t.id),
      ['notification', 'skill']
    );
    assert.ok(inline.every((t) => t.htmlTag === 'span'));
    assert.ok(block.every((t) => t.htmlTag === 'div' || t.htmlTag === 'section'));
  });
});
