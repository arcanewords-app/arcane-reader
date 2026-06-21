import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTHOR_TIER_MODEL,
  clampStageModelForRole,
  clampStageModelsForRole,
  defaultStageModelsForRole,
  isPremiumProdModel,
  modelsForProdSettingsByRole,
  roleHasPremiumModelAccess,
} from './modelAccess.js';

describe('modelAccess', () => {
  it('roleHasPremiumModelAccess', () => {
    assert.equal(roleHasPremiumModelAccess('author'), false);
    assert.equal(roleHasPremiumModelAccess('author_plus'), true);
    assert.equal(roleHasPremiumModelAccess('super_author'), true);
    assert.equal(roleHasPremiumModelAccess('admin'), true);
  });

  it('modelsForProdSettingsByRole author gets only 4.1-mini on translate', () => {
    const models = modelsForProdSettingsByRole('translation', 'author');
    assert.equal(models.length, 1);
    assert.equal(models[0]?.value, AUTHOR_TIER_MODEL);
  });

  it('modelsForProdSettingsByRole author_plus gets full list', () => {
    const models = modelsForProdSettingsByRole('translation', 'author_plus');
    assert.equal(models.length, 3);
  });

  it('clampStageModelForRole author premium to 4.1-mini', () => {
    assert.equal(
      clampStageModelForRole('gpt-5.4-mini', 'translation', 'author'),
      AUTHOR_TIER_MODEL
    );
    assert.equal(
      clampStageModelForRole('gpt-5.4-mini', 'translation', 'author_plus'),
      'gpt-5.4-mini'
    );
  });

  it('clampStageModelsForRole', () => {
    const clamped = clampStageModelsForRole(
      {
        analysis: 'gpt-4.1-mini',
        translation: 'gpt-5.4-mini',
        editing: 'o4-mini',
      },
      'author'
    );
    assert.deepEqual(clamped, {
      analysis: AUTHOR_TIER_MODEL,
      translation: AUTHOR_TIER_MODEL,
      editing: AUTHOR_TIER_MODEL,
    });
  });

  it('defaultStageModelsForRole', () => {
    assert.deepEqual(defaultStageModelsForRole('author'), {
      analysis: AUTHOR_TIER_MODEL,
      translation: AUTHOR_TIER_MODEL,
      editing: AUTHOR_TIER_MODEL,
    });
    assert.equal(defaultStageModelsForRole('author_plus').translation, 'gpt-5.4-mini');
  });

  it('isPremiumProdModel', () => {
    assert.equal(isPremiumProdModel('translation', 'gpt-5.4-mini'), true);
    assert.equal(isPremiumProdModel('translation', AUTHOR_TIER_MODEL), false);
    assert.equal(isPremiumProdModel('analysis', 'gpt-4.1-mini'), false);
  });
});
