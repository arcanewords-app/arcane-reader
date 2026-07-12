import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { EDIT_FOCUS_LABELS, EDIT_STYLE_LABELS } from './editing-labels.js';

describe('editing-labels', () => {
  it('EDIT_STYLE_LABELS covers all presets', () => {
    assert.equal(EDIT_STYLE_LABELS.default, 'Standard');
    assert.equal(EDIT_STYLE_LABELS.literary, 'Literary');
    assert.equal(EDIT_STYLE_LABELS.ai_revivification, 'AI translation fix');
  });

  it('EDIT_FOCUS_LABELS covers all focus modes', () => {
    assert.equal(EDIT_FOCUS_LABELS.fix_only, 'Fix only');
    assert.equal(EDIT_FOCUS_LABELS.polish, 'Polish');
    assert.equal(EDIT_FOCUS_LABELS.elevate, 'Literary elevation');
  });
});
