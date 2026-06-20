import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultEditPresetForModel,
  inferEditPresetFromLegacyParams,
  resolvePresetToEditOptions,
  EDIT_FAST_CHUNK_SIZE,
  EDIT_STANDARD_CHUNK_SIZE,
} from './edit-quality-presets.js';

describe('resolvePresetToEditOptions', () => {
  it('fast uses minimal style, fix_only, forced chunked', () => {
    assert.deepEqual(resolvePresetToEditOptions('fast'), {
      editingStylePreset: 'minimal',
      editingFocus: 'fix_only',
      forceChunked: true,
      forceSingleShot: false,
      defaultChunkSize: EDIT_FAST_CHUNK_SIZE,
    });
  });

  it('standard uses default style and polish focus', () => {
    const opts = resolvePresetToEditOptions('standard');
    assert.equal(opts.editingStylePreset, 'default');
    assert.equal(opts.editingFocus, 'polish');
    assert.equal(opts.forceChunked, false);
    assert.equal(opts.defaultChunkSize, EDIT_STANDARD_CHUNK_SIZE);
  });

  it('enhanced uses literary style and polish focus', () => {
    const opts = resolvePresetToEditOptions('enhanced');
    assert.equal(opts.editingStylePreset, 'literary');
    assert.equal(opts.editingFocus, 'polish');
    assert.equal(opts.forceSingleShot, true);
    assert.equal(opts.forceChunked, false);
  });
});

describe('defaultEditPresetForModel', () => {
  it('returns enhanced for gpt-5.4-mini and o4-mini', () => {
    assert.equal(defaultEditPresetForModel('gpt-5.4-mini'), 'enhanced');
    assert.equal(defaultEditPresetForModel('o4-mini'), 'enhanced');
  });

  it('returns standard for gpt-4.1-mini', () => {
    assert.equal(defaultEditPresetForModel('gpt-4.1-mini'), 'standard');
  });
});

describe('inferEditPresetFromLegacyParams', () => {
  it('maps minimal + fix_only to fast', () => {
    assert.equal(inferEditPresetFromLegacyParams({ preset: 'minimal', focus: 'fix_only' }), 'fast');
  });

  it('maps legacy minimal + fix_problems to fast', () => {
    assert.equal(
      inferEditPresetFromLegacyParams({ preset: 'minimal', focus: 'fix_problems' }),
      'fast'
    );
  });

  it('maps literary to enhanced', () => {
    assert.equal(inferEditPresetFromLegacyParams({ preset: 'literary' }), 'enhanced');
  });

  it('maps ai_revivification to enhanced', () => {
    assert.equal(inferEditPresetFromLegacyParams({ preset: 'ai_revivification' }), 'enhanced');
  });

  it('defaults to standard', () => {
    assert.equal(inferEditPresetFromLegacyParams({}), 'standard');
  });
});
