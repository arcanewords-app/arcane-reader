import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  analysisExcludedModelIds,
  DEFAULT_LLM_MODEL,
  DEFAULT_TRANSLATION_STAGE_MODEL,
  isModelInList,
  isModelInProdSettingsList,
  isReasoningModel,
  LLM_MODELS,
  modelCapabilitiesForUi,
  modelsForProdSettings,
  modelsForPromptLabStage,
  modelsForStage,
  modelUsesDefaultTemperature,
  PROD_ANALYSIS_MODELS,
  PROD_TRANSLATE_EDIT_MODELS,
  promptLabModelCapabilitiesForUi,
  PROMPT_LAB_ANALYZE_MODELS,
  PROMPT_LAB_EDIT_MODELS,
  PROMPT_LAB_TRANSLATE_MODELS,
  TRANSLATION_LEGACY_MODELS,
  TRANSLATION_RECOMMENDED_MODELS,
} from './llmModels.js';

describe('modelsForProdSettings', () => {
  it('analysis returns only gpt-4.1-mini', () => {
    const models = modelsForProdSettings('analysis');
    assert.equal(models.length, 1);
    assert.equal(models[0]?.value, 'gpt-4.1-mini');
    assert.deepEqual(models, PROD_ANALYSIS_MODELS);
  });

  it('normalizes analyze alias to analysis list', () => {
    assert.deepEqual(modelsForProdSettings('analyze'), PROD_ANALYSIS_MODELS);
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

  it('normalizes translate alias to translation list', () => {
    assert.deepEqual(modelsForProdSettings('translate'), PROD_TRANSLATE_EDIT_MODELS);
  });

  it('editing matches translation list', () => {
    assert.deepEqual(modelsForProdSettings('editing'), PROD_TRANSLATE_EDIT_MODELS);
  });

  it('isModelInProdSettingsList', () => {
    assert.equal(isModelInProdSettingsList('translation', 'gpt-5.4-mini'), true);
    assert.equal(isModelInProdSettingsList('translation', 'gpt-5-mini'), false);
    assert.equal(isModelInProdSettingsList('analysis', 'gpt-4.1-mini'), true);
    assert.equal(isModelInProdSettingsList('analysis', 'o4-mini'), false);
  });
});

describe('modelsForStage', () => {
  it('excludes reasoning models from analysis stage', () => {
    const models = modelsForStage('analysis');
    assert.ok(models.every((m) => !isReasoningModel(m.value)));
    assert.ok(!models.some((m) => m.value === 'o4-mini'));
  });

  it('includes all LLM models for translation stage', () => {
    assert.equal(modelsForStage('translation').length, LLM_MODELS.length);
  });

  it('includes all LLM models for editing stage', () => {
    assert.equal(modelsForStage('editing').length, LLM_MODELS.length);
  });
});

describe('modelsForPromptLabStage', () => {
  it('returns analyze subset for analysis', () => {
    assert.deepEqual(modelsForPromptLabStage('analysis'), PROMPT_LAB_ANALYZE_MODELS);
  });

  it('returns translate subset for translation', () => {
    assert.deepEqual(modelsForPromptLabStage('translation'), PROMPT_LAB_TRANSLATE_MODELS);
  });

  it('returns edit subset for editing', () => {
    assert.deepEqual(modelsForPromptLabStage('editing'), PROMPT_LAB_EDIT_MODELS);
  });
});

describe('model helpers', () => {
  it('isModelInList recognizes catalog models', () => {
    assert.equal(isModelInList('gpt-4.1-mini'), true);
    assert.equal(isModelInList('unknown-model'), false);
  });

  it('modelUsesDefaultTemperature for reasoning and gpt-5 models', () => {
    assert.equal(modelUsesDefaultTemperature('gpt-5.4-mini'), true);
    assert.equal(modelUsesDefaultTemperature('o4-mini'), true);
    assert.equal(modelUsesDefaultTemperature('gpt-4.1-mini'), false);
  });

  it('isReasoningModel identifies o-series models', () => {
    assert.equal(isReasoningModel('o4-mini'), true);
    assert.equal(isReasoningModel('gpt-4.1-mini'), false);
  });

  it('analysisExcludedModelIds lists reasoning models only', () => {
    const excluded = analysisExcludedModelIds();
    assert.ok(excluded.includes('o4-mini'));
    assert.ok(!excluded.includes('gpt-4.1-mini'));
  });

  it('modelCapabilitiesForUi attaches capabilities to every model', () => {
    const caps = modelCapabilitiesForUi();
    assert.equal(caps.length, LLM_MODELS.length);
    assert.ok(caps.every((m) => typeof m.supportsStructuredOutput === 'boolean'));
  });

  it('promptLabModelCapabilitiesForUi covers lab model union', () => {
    const caps = promptLabModelCapabilitiesForUi();
    const values = caps.map((m) => m.value);
    for (const m of PROMPT_LAB_TRANSLATE_MODELS) {
      assert.ok(values.includes(m.value));
    }
  });

  it('exports default constants', () => {
    assert.equal(DEFAULT_LLM_MODEL, 'gpt-4.1-mini');
    assert.equal(DEFAULT_TRANSLATION_STAGE_MODEL, 'gpt-5.4-mini');
    assert.deepEqual([...TRANSLATION_RECOMMENDED_MODELS], ['gpt-5.4-mini', 'o4-mini']);
    assert.deepEqual([...TRANSLATION_LEGACY_MODELS], ['gpt-4.1-mini']);
  });
});
