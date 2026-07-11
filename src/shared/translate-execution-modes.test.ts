import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  defaultExecutionModeForModel,
  inferExecutionModeFromLegacyParams,
  normalizeTranslateExecutionMode,
  resolveExecutionModeToTranslateOptions,
} from './translate-execution-modes.js';
import { PROMPT_LAB_TRANSLATE_MODELS } from './llmModels.js';

describe('resolveExecutionModeToTranslateOptions', () => {
  it('chunked disables CoT and few-shot', () => {
    assert.deepEqual(resolveExecutionModeToTranslateOptions('chunked'), {
      enableTranslateFewShot: false,
      enableTranslateCoT: false,
      translateLeadingContextParagraphs: 0,
    });
  });

  it('one_shot enables CoT, few-shot, and leading context', () => {
    assert.deepEqual(resolveExecutionModeToTranslateOptions('one_shot'), {
      enableTranslateFewShot: true,
      enableTranslateCoT: true,
      translateLeadingContextParagraphs: 2,
    });
  });
});

describe('normalizeTranslateExecutionMode', () => {
  it('maps legacy presets', () => {
    assert.equal(normalizeTranslateExecutionMode('enhanced'), 'one_shot');
    assert.equal(normalizeTranslateExecutionMode('standard'), 'chunked');
    assert.equal(normalizeTranslateExecutionMode('fast'), 'chunked');
  });
});

describe('defaultExecutionModeForModel', () => {
  it('returns one_shot for gpt-5.4-mini and o4-mini', () => {
    assert.equal(defaultExecutionModeForModel('gpt-5.4-mini'), 'one_shot');
    assert.equal(defaultExecutionModeForModel('o4-mini'), 'one_shot');
  });

  it('returns chunked for gpt-4.1-mini', () => {
    assert.equal(defaultExecutionModeForModel('gpt-4.1-mini'), 'chunked');
  });
});

describe('inferExecutionModeFromLegacyParams', () => {
  it('maps CoT runs to one_shot', () => {
    assert.equal(inferExecutionModeFromLegacyParams({ enableTranslateCoT: true }), 'one_shot');
  });

  it('defaults to chunked', () => {
    assert.equal(inferExecutionModeFromLegacyParams({}), 'chunked');
  });
});

describe('PROMPT_LAB_TRANSLATE_MODELS', () => {
  it('includes exactly three focused translate models', () => {
    assert.equal(PROMPT_LAB_TRANSLATE_MODELS.length, 3);
  });
});
