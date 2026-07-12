import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  EXECUTION_PRESET_UI_KEYS,
  executionPresetHintI18nKey,
  executionPresetI18nKey,
} from './execution-presets-ui.js';

describe('execution-presets-ui', () => {
  it('EXECUTION_PRESET_UI_KEYS maps modes to i18n suffixes', () => {
    assert.equal(EXECUTION_PRESET_UI_KEYS.chunked, 'standard');
    assert.equal(EXECUTION_PRESET_UI_KEYS.one_shot, 'advanced');
  });

  it('executionPresetI18nKey returns suffix for mode', () => {
    assert.equal(executionPresetI18nKey('chunked'), 'standard');
    assert.equal(executionPresetI18nKey('one_shot'), 'advanced');
  });

  it('executionPresetHintI18nKey appends Hint suffix', () => {
    assert.equal(executionPresetHintI18nKey('chunked'), 'standardHint');
    assert.equal(executionPresetHintI18nKey('one_shot'), 'advancedHint');
  });
});
