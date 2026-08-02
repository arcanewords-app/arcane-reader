import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import * as editQuality from './edit-quality-presets.js';
import * as translateQuality from './translate-quality-presets.js';
import { DEFAULT_EDITING_FOCUS, normalizeEditingFocus } from './editing-focus.js';

describe('deprecated shared re-exports', () => {
  it('re-exports edit and translate execution mode helpers', () => {
    assert.equal(typeof editQuality, 'object');
    assert.equal(typeof translateQuality, 'object');
    assert.ok(Object.keys(editQuality).length > 0);
    assert.ok(Object.keys(translateQuality).length > 0);
  });

  it('re-exports editing focus helpers', () => {
    assert.ok(DEFAULT_EDITING_FOCUS);
    assert.equal(normalizeEditingFocus(undefined), DEFAULT_EDITING_FOCUS);
  });
});
