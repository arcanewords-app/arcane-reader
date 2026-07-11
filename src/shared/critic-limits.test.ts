import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildCriticInputStats,
  CRITIC_MAX_INPUT_CHARS,
  resolveCriticIssueBudget,
  criticNeedsHighOutputBudget,
} from './critic-limits.js';

describe('critic limits', () => {
  it('buildCriticInputStats flags tooLarge above limit', () => {
    const stats = buildCriticInputStats({
      sourceChars: 30_000,
      translationChars: 30_000,
      glossaryChars: 15_000,
      paragraphCount: 50,
    });
    assert.equal(stats.tooLarge, true);
    assert.equal(stats.totalChars, 75_000);
    assert.equal(stats.maxInputChars, CRITIC_MAX_INPUT_CHARS);
  });

  it('allows input within limit', () => {
    const stats = buildCriticInputStats({
      sourceChars: 20_000,
      translationChars: 20_000,
      glossaryChars: 5_000,
      paragraphCount: 40,
    });
    assert.equal(stats.tooLarge, false);
  });

  it('resolveCriticIssueBudget scales with paragraph count', () => {
    assert.equal(resolveCriticIssueBudget(10), 12);
    assert.equal(resolveCriticIssueBudget(45), 18);
    assert.equal(resolveCriticIssueBudget(80), 24);
  });

  it('criticNeedsHighOutputBudget for long chapters', () => {
    assert.equal(criticNeedsHighOutputBudget(30, 10_000), false);
    assert.equal(criticNeedsHighOutputBudget(61, 10_000), true);
    assert.equal(criticNeedsHighOutputBudget(10, 50_000), true);
  });
});
