import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { resolvePrompts } from './registry.js';

describe('prompts registry', () => {
  it('resolvePrompts returns analyzer bundle for supported pair', () => {
    const bundle = resolvePrompts('analyze', 'en', 'ru');
    assert.ok(bundle.systemPrompt.length > 0);
    assert.equal(typeof bundle.createUserPrompt, 'function');
  });

  it('resolvePrompts returns translator bundle', () => {
    const bundle = resolvePrompts('translate', 'ko', 'be');
    assert.ok(bundle.systemPrompt.length > 0);
  });

  it('resolvePrompts throws for unsupported pair', () => {
    assert.throws(() => resolvePrompts('analyze', 'en', 'en'));
  });

  it('resolvePrompts rejects edit stage', () => {
    assert.throws(() => resolvePrompts('edit' as 'analyze', 'en', 'ru'));
  });
});
