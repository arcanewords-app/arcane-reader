import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  resolveEditExecutionMode,
  resolveEditPipelineOptions,
  resolveTranslateExecutionMode,
  resolveTranslatePipelineOptions,
} from './resolve-execution-options.js';

describe('resolveTranslateExecutionMode', () => {
  it('uses explicit translateExecutionMode', () => {
    assert.equal(
      resolveTranslateExecutionMode({ translateExecutionMode: 'one_shot' }, 'gpt-4.1-mini'),
      'one_shot'
    );
  });

  it('infers from legacy granular flags', () => {
    assert.equal(
      resolveTranslateExecutionMode({ enableTranslateCoT: true }, 'gpt-4.1-mini'),
      'one_shot'
    );
  });

  it('defaults to model when no explicit mode or legacy flags', () => {
    assert.equal(resolveTranslateExecutionMode({}, 'gpt-5.4-mini'), 'one_shot');
    assert.equal(resolveTranslateExecutionMode({}, 'gpt-4.1-mini'), 'chunked');
  });
});

describe('resolveTranslatePipelineOptions', () => {
  it('maps one_shot to CoT and few-shot flags', () => {
    const opts = resolveTranslatePipelineOptions(
      { translateExecutionMode: 'one_shot' },
      'gpt-5.4-mini'
    );
    assert.equal(opts.enableTranslateCoT, true);
    assert.equal(opts.enableTranslateFewShot, true);
    assert.equal(opts.translateLeadingContextParagraphs, 2);
  });

  it('maps chunked to flags off', () => {
    const opts = resolveTranslatePipelineOptions({}, 'gpt-4.1-mini');
    assert.equal(opts.translateExecutionMode, 'chunked');
    assert.equal(opts.enableTranslateCoT, false);
    assert.equal(opts.enableTranslateFewShot, false);
    assert.equal(opts.translateLeadingContextParagraphs, 0);
  });

  it('passes chunkSize only when explicit override', () => {
    assert.equal(resolveTranslatePipelineOptions({}, 'gpt-4.1-mini').chunkSize, undefined);
    assert.equal(
      resolveTranslatePipelineOptions({ chunkSize: 4500 }, 'gpt-4.1-mini').chunkSize,
      4500
    );
  });
});

describe('resolveEditExecutionMode', () => {
  it('uses explicit editExecutionMode', () => {
    assert.equal(
      resolveEditExecutionMode({ editExecutionMode: 'chunked' }, 'gpt-5.4-mini'),
      'chunked'
    );
  });

  it('infers one_shot from literary preset', () => {
    assert.equal(
      resolveEditExecutionMode({ editingStylePreset: 'literary' }, 'gpt-4.1-mini'),
      'one_shot'
    );
  });

  it('defaults to model when no override', () => {
    assert.equal(resolveEditExecutionMode({}, 'gpt-5.4-mini'), 'one_shot');
    assert.equal(resolveEditExecutionMode({}, 'gpt-4.1-mini'), 'chunked');
  });
});

describe('resolveEditPipelineOptions', () => {
  it('short draft in one_shot mode uses forceSingleShot', () => {
    const shortDraft = 'Short translated paragraph.';
    const opts = resolveEditPipelineOptions(
      { editExecutionMode: 'one_shot' },
      'gpt-5.4-mini',
      shortDraft,
      '',
      '',
      true
    );
    assert.equal(opts.forceSingleShot, true);
    assert.equal(opts.chunkSize, undefined);
    assert.equal(opts.editingStylePreset, 'literary');
  });

  it('user style preset wins over mode-derived style', () => {
    const opts = resolveEditPipelineOptions(
      { editExecutionMode: 'one_shot', editingStylePreset: 'minimal' },
      'gpt-5.4-mini',
      'Short draft.',
      '',
      '',
      true
    );
    assert.equal(opts.editingStylePreset, 'minimal');
  });

  it('chunked mode on long draft uses standard chunk size', () => {
    const longDraft = 'x'.repeat(20_000);
    const opts = resolveEditPipelineOptions(
      { editExecutionMode: 'chunked' },
      'gpt-4.1-mini',
      longDraft,
      '',
      '',
      true
    );
    assert.equal(opts.forceSingleShot, false);
    assert.equal(opts.chunkSize, 3000);
  });
});

describe('anchor benchmark (3k CJK)', () => {
  it('gpt-5.4-mini one_shot fits ~3000 CJK chars', async () => {
    const { canSingleShotTranslate, resolveTranslateChunkingMode } =
      await import('../translate-chunking-policy.js');
    const cjk = '汉'.repeat(3000);
    const glossary = 'term '.repeat(50);
    const optimization = {
      enableFewShot: true,
      enableCoT: true,
      enableStructuredCoT: false,
      leadingContextParagraphs: 2,
    };
    const input = {
      sourceText: cjk,
      modelId: 'gpt-5.4-mini',
      targetLanguage: 'ru' as const,
      glossaryText: glossary,
      optimization,
      executionMode: 'one_shot' as const,
    };
    assert.equal(canSingleShotTranslate(input), true);
    assert.equal(resolveTranslateChunkingMode(input).mode, 'single_shot');
  });
});
