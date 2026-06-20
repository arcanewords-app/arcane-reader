import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_EDITING_FOCUS, normalizeEditingFocus } from './editing-focus.js';

describe('normalizeEditingFocus', () => {
  it('maps legacy values', () => {
    assert.equal(normalizeEditingFocus('fix_problems'), 'fix_only');
    assert.equal(normalizeEditingFocus('both'), 'polish');
    assert.equal(normalizeEditingFocus('style_only'), 'elevate');
  });

  it('passes through new values', () => {
    assert.equal(normalizeEditingFocus('fix_only'), 'fix_only');
    assert.equal(normalizeEditingFocus('polish'), 'polish');
    assert.equal(normalizeEditingFocus('elevate'), 'elevate');
  });

  it('defaults to polish', () => {
    assert.equal(normalizeEditingFocus(undefined), DEFAULT_EDITING_FOCUS);
    assert.equal(normalizeEditingFocus(null), DEFAULT_EDITING_FOCUS);
  });
});
