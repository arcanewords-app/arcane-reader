import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { PROD_ANALYSIS_MODELS, PROD_TRANSLATE_EDIT_MODELS } from './prodModelLists.js';

describe('prodModelLists', () => {
  it('PROD_TRANSLATE_EDIT_MODELS has value and label for each option', () => {
    assert.ok(PROD_TRANSLATE_EDIT_MODELS.length >= 3);
    for (const opt of PROD_TRANSLATE_EDIT_MODELS) {
      assert.ok(opt.value.length > 0);
      assert.ok(opt.label.length > 0);
    }
  });

  it('PROD_ANALYSIS_MODELS includes gpt-4.1-mini', () => {
    assert.ok(PROD_ANALYSIS_MODELS.some((m) => m.value === 'gpt-4.1-mini'));
  });
});
