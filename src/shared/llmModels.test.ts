import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  modelsForProdSettings,
  PROD_ANALYSIS_MODELS,
  PROD_TRANSLATE_EDIT_MODELS,
  isModelInProdSettingsList,
} from './llmModels.js';

describe('modelsForProdSettings', () => {
  it('analysis returns only gpt-4.1-mini', () => {
    const models = modelsForProdSettings('analysis');
    assert.equal(models.length, 1);
    assert.equal(models[0]?.value, 'gpt-4.1-mini');
    assert.deepEqual(models, PROD_ANALYSIS_MODELS);
  });

  it('translation returns 3 Lab-aligned models', () => {
    const models = modelsForProdSettings('translation');
    assert.equal(models.length, 3);
    assert.deepEqual(
      models.map((m) => m.value),
      ['gpt-5.4-mini', 'o4-mini', 'gpt-4.1-mini']
    );
    assert.deepEqual(models, PROD_TRANSLATE_EDIT_MODELS);
  });

  it('editing matches translation list', () => {
    assert.deepEqual(modelsForProdSettings('editing'), PROD_TRANSLATE_EDIT_MODELS);
  });

  it('isModelInProdSettingsList', () => {
    assert.equal(isModelInProdSettingsList('translation', 'gpt-5.4-mini'), true);
    assert.equal(isModelInProdSettingsList('translation', 'gpt-5-mini'), false);
  });
});
