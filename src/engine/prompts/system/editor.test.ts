import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_EDITING_FOCUS, normalizeEditingFocus } from './editor.js';

describe('normalizeEditingFocus', () => {
  it('returns canonical focus values unchanged', () => {
    assert.equal(normalizeEditingFocus('fix_only'), 'fix_only');
    assert.equal(normalizeEditingFocus('polish'), 'polish');
    assert.equal(normalizeEditingFocus('elevate'), 'elevate');
  });

  it('maps legacy values to canonical focus', () => {
    assert.equal(normalizeEditingFocus('fix_problems'), 'fix_only');
    assert.equal(normalizeEditingFocus('style_only'), 'elevate');
    assert.equal(normalizeEditingFocus('both'), 'polish');
  });

  it('defaults unknown values to polish', () => {
    assert.equal(normalizeEditingFocus(null), DEFAULT_EDITING_FOCUS);
    assert.equal(normalizeEditingFocus('unknown'), DEFAULT_EDITING_FOCUS);
  });
});
