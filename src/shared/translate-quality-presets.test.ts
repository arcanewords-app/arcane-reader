import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultPresetForModel,
  inferPresetFromLegacyParams,
  resolvePresetToTranslateOptions,
} from './translate-quality-presets.js';
import { PROMPT_LAB_TRANSLATE_MODELS } from './llmModels.js';

describe('resolvePresetToTranslateOptions', () => {
  it('fast and standard disable CoT and few-shot', () => {
    assert.deepEqual(resolvePresetToTranslateOptions('fast'), {
      enableTranslateFewShot: false,
      enableTranslateCoT: false,
      translateLeadingContextParagraphs: 0,
    });
    assert.deepEqual(resolvePresetToTranslateOptions('standard'), {
      enableTranslateFewShot: false,
      enableTranslateCoT: false,
      translateLeadingContextParagraphs: 0,
    });
  });

  it('enhanced enables CoT, few-shot, and leading context', () => {
    assert.deepEqual(resolvePresetToTranslateOptions('enhanced'), {
      enableTranslateFewShot: true,
      enableTranslateCoT: true,
      translateLeadingContextParagraphs: 2,
    });
  });
});

describe('defaultPresetForModel', () => {
  it('returns enhanced for gpt-5.4-mini and o4-mini', () => {
    assert.equal(defaultPresetForModel('gpt-5.4-mini'), 'enhanced');
    assert.equal(defaultPresetForModel('gpt-5.4-mini-2026-03-17'), 'enhanced');
    assert.equal(defaultPresetForModel('o4-mini'), 'enhanced');
  });

  it('returns standard for gpt-4.1-mini', () => {
    assert.equal(defaultPresetForModel('gpt-4.1-mini'), 'standard');
  });
});

describe('inferPresetFromLegacyParams', () => {
  it('maps CoT runs to enhanced', () => {
    assert.equal(inferPresetFromLegacyParams({ enableTranslateCoT: true }), 'enhanced');
  });

  it('maps mini profile to enhanced', () => {
    assert.equal(inferPresetFromLegacyParams({ miniModelTranslationProfile: true }), 'enhanced');
  });

  it('defaults to standard', () => {
    assert.equal(inferPresetFromLegacyParams({}), 'standard');
  });
});

describe('PROMPT_LAB_TRANSLATE_MODELS', () => {
  it('includes exactly three focused translate models', () => {
    assert.equal(PROMPT_LAB_TRANSLATE_MODELS.length, 3);
    assert.deepEqual(
      PROMPT_LAB_TRANSLATE_MODELS.map((m) => m.value),
      ['gpt-4.1-mini', 'gpt-5.4-mini', 'o4-mini']
    );
  });
});
