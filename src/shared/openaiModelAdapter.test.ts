import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildChatCompletionParams,
  isReasoningModel,
  modelUsesDefaultTemperature,
  resolveModelCapabilities,
  resolveTranslateLlmDefaults,
} from './openaiModelAdapter.js';

describe('resolveModelCapabilities', () => {
  it('classifies gpt-5.4-mini as reasoning gpt-5 family', () => {
    const caps = resolveModelCapabilities('gpt-5.4-mini');
    assert.equal(caps.family, 'gpt-5');
    assert.equal(caps.isReasoningModel, true);
    assert.equal(caps.supportsCustomTemperature, false);
    assert.equal(caps.tokenLimitParam, 'max_completion_tokens');
    assert.equal(caps.supportsReasoningEffort, true);
    assert.equal(caps.promoFreeTier, true);
  });

  it('classifies snapshot id gpt-5.4-mini-2026-03-17 like alias', () => {
    const alias = resolveModelCapabilities('gpt-5.4-mini');
    const snap = resolveModelCapabilities('gpt-5.4-mini-2026-03-17');
    assert.equal(snap.family, alias.family);
    assert.equal(snap.isReasoningModel, alias.isReasoningModel);
    assert.equal(snap.promoFreeTier, true);
  });

  it('classifies o4-mini as o-series reasoning', () => {
    const caps = resolveModelCapabilities('o4-mini');
    assert.equal(caps.family, 'o-series');
    assert.equal(caps.isReasoningModel, true);
    assert.equal(caps.supportsReasoningEffort, true);
    assert.equal(caps.promoFreeTier, true);
  });

  it('classifies gpt-4o-mini as non-reasoning gpt-4o', () => {
    const caps = resolveModelCapabilities('gpt-4o-mini');
    assert.equal(caps.family, 'gpt-4o');
    assert.equal(caps.isReasoningModel, false);
    assert.equal(caps.supportsCustomTemperature, true);
    assert.equal(caps.supportsReasoningEffort, false);
  });

  it('classifies gpt-4.1-mini with max_completion_tokens and temperature', () => {
    const caps = resolveModelCapabilities('gpt-4.1-mini');
    assert.equal(caps.family, 'gpt-4.1');
    assert.equal(caps.tokenLimitParam, 'max_completion_tokens');
    assert.equal(caps.supportsCustomTemperature, true);
  });
});

describe('buildChatCompletionParams', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }];

  it('omits temperature for gpt-5.4-mini', () => {
    const params = buildChatCompletionParams({
      model: 'gpt-5.4-mini',
      messages,
      defaultTemperature: 0.7,
      options: { temperature: 0.5, maxTokens: 1024 },
    });
    assert.equal(params.temperature, undefined);
    assert.equal(params.max_completion_tokens, 1024);
  });

  it('includes reasoning_effort when set on o4-mini', () => {
    const params = buildChatCompletionParams({
      model: 'o4-mini',
      messages,
      defaultTemperature: 0.3,
      options: { reasoningEffort: 'low' },
    });
    assert.equal(params.reasoning_effort, 'low');
    assert.equal(params.temperature, undefined);
  });

  it('includes temperature for gpt-4o-mini', () => {
    const params = buildChatCompletionParams({
      model: 'gpt-4o-mini',
      messages,
      defaultTemperature: 0.7,
      options: { temperature: 0.4 },
    });
    assert.equal(params.temperature, 0.4);
    assert.equal(params.reasoning_effort, undefined);
  });

  it('does not add reasoning_effort for gpt-4o-mini', () => {
    const params = buildChatCompletionParams({
      model: 'gpt-4o-mini',
      messages,
      defaultTemperature: 0.7,
      options: { reasoningEffort: 'high' },
    });
    assert.equal(params.reasoning_effort, undefined);
  });

  it('adds json_object response_format', () => {
    const params = buildChatCompletionParams({
      model: 'gpt-4.1-mini',
      messages,
      defaultTemperature: 0.3,
      responseFormat: 'json_object',
    });
    assert.deepEqual(params.response_format, { type: 'json_object' });
  });
});

describe('helper exports', () => {
  it('modelUsesDefaultTemperature matches capabilities', () => {
    assert.equal(modelUsesDefaultTemperature('gpt-5.4-mini'), true);
    assert.equal(modelUsesDefaultTemperature('gpt-4o-mini'), false);
  });

  it('isReasoningModel matches capabilities', () => {
    assert.equal(isReasoningModel('o4-mini'), true);
    assert.equal(isReasoningModel('gpt-4o-mini'), false);
  });
});

describe('resolveTranslateLlmDefaults', () => {
  it('returns higher token budget and low effort for gpt-5.4-mini', () => {
    const defaults = resolveTranslateLlmDefaults('gpt-5.4-mini', false);
    assert.equal(defaults.maxTokens, 12288);
    assert.equal(defaults.defaultReasoningEffort, 'low');
    assert.equal(defaults.preferJsonObjectOverStructuredSchema, true);
  });

  it('raises max tokens when structured CoT is enabled on reasoning model', () => {
    const defaults = resolveTranslateLlmDefaults('gpt-5.4-mini', true);
    assert.equal(defaults.maxTokens, 16384);
  });

  it('returns 8192 tokens for gpt-4.1-mini without reasoning defaults', () => {
    const defaults = resolveTranslateLlmDefaults('gpt-4.1-mini', false);
    assert.equal(defaults.maxTokens, 8192);
    assert.equal(defaults.defaultReasoningEffort, undefined);
    assert.equal(defaults.preferJsonObjectOverStructuredSchema, false);
  });
});
