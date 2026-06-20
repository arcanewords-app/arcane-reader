import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultEditExecutionModeForModel,
  inferEditExecutionModeFromLegacyParams,
  normalizeEditExecutionMode,
  resolveExecutionModeToEditOptions,
  EDIT_STANDARD_CHUNK_SIZE,
} from './edit-execution-modes.js';

describe('resolveExecutionModeToEditOptions', () => {
  it('chunked uses default style and polish focus', () => {
    const opts = resolveExecutionModeToEditOptions('chunked');
    assert.equal(opts.editingStylePreset, 'default');
    assert.equal(opts.editingFocus, 'polish');
    assert.equal(opts.forceChunked, false);
    assert.equal(opts.defaultChunkSize, EDIT_STANDARD_CHUNK_SIZE);
  });

  it('one_shot uses literary style and polish focus', () => {
    const opts = resolveExecutionModeToEditOptions('one_shot');
    assert.equal(opts.editingStylePreset, 'literary');
    assert.equal(opts.editingFocus, 'polish');
    assert.equal(opts.forceSingleShot, true);
    assert.equal(opts.forceChunked, false);
  });
});

describe('defaultEditExecutionModeForModel', () => {
  it('returns one_shot for gpt-5.4-mini and o4-mini', () => {
    assert.equal(defaultEditExecutionModeForModel('gpt-5.4-mini'), 'one_shot');
    assert.equal(defaultEditExecutionModeForModel('o4-mini'), 'one_shot');
  });

  it('returns chunked for gpt-4.1-mini', () => {
    assert.equal(defaultEditExecutionModeForModel('gpt-4.1-mini'), 'chunked');
  });
});

describe('inferEditExecutionModeFromLegacyParams', () => {
  it('maps literary to one_shot', () => {
    assert.equal(inferEditExecutionModeFromLegacyParams({ preset: 'literary' }), 'one_shot');
  });

  it('defaults to chunked', () => {
    assert.equal(inferEditExecutionModeFromLegacyParams({}), 'chunked');
  });
});

describe('normalizeEditExecutionMode', () => {
  it('maps legacy presets', () => {
    assert.equal(normalizeEditExecutionMode('enhanced'), 'one_shot');
    assert.equal(normalizeEditExecutionMode('fast'), 'chunked');
  });
});
