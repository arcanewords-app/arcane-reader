import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  AI_REPLACE_DETAIL_MAX_CHARS,
  AI_REPLACE_PRESET_IDS,
  aiReplacePresetLabelKey,
  buildPresetInstruction,
  sanitizeAiReplaceDetail,
} from './aiReplacePresets.js';

describe('aiReplacePresets', () => {
  it('builds i18n label keys for all presets', () => {
    for (const preset of AI_REPLACE_PRESET_IDS) {
      assert.equal(aiReplacePresetLabelKey(preset), `searchReplace.aiPreset.${preset}`);
    }
  });

  it('buildPresetInstruction includes target language label', () => {
    const instruction = buildPresetInstruction('name_declension', 'Russian');
    assert.match(instruction, /Russian/);
    assert.match(instruction, /declension/i);
  });

  it('sanitizeAiReplaceDetail strips control chars and HTML tags', () => {
    assert.equal(sanitizeAiReplaceDetail('<b>hint</b>'), 'hint');
    assert.equal(sanitizeAiReplaceDetail('  ok  '), 'ok');
    assert.equal(sanitizeAiReplaceDetail(''), undefined);
    assert.equal(sanitizeAiReplaceDetail(undefined), undefined);
  });

  it('sanitizeAiReplaceDetail truncates to max length', () => {
    const long = 'a'.repeat(AI_REPLACE_DETAIL_MAX_CHARS + 50);
    assert.equal(sanitizeAiReplaceDetail(long)?.length, AI_REPLACE_DETAIL_MAX_CHARS);
  });
});
