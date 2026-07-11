import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildEvaluationInputStats,
  EVALUATION_MAX_INPUT_CHARS,
  evaluationInputTooLargeMessage,
} from './evaluation-limits.js';
import { assertEvaluationInputSize, EvaluationInputTooLargeError } from './evaluator.js';

describe('evaluation input preflight', () => {
  it('flags tooLarge when combined input exceeds limit', () => {
    const perPart = Math.floor(EVALUATION_MAX_INPUT_CHARS / 3) + 1;
    const stats = buildEvaluationInputStats({
      sourceChars: perPart,
      leftChars: perPart,
      rightChars: perPart,
      glossaryChars: 0,
    });
    assert.equal(stats.tooLarge, true);
    assert.match(evaluationInputTooLargeMessage(stats), /too long for A\/B evaluation/);
  });

  it('assertEvaluationInputSize throws EvaluationInputTooLargeError (preflight 400)', () => {
    const stats = buildEvaluationInputStats({
      sourceChars: EVALUATION_MAX_INPUT_CHARS,
      leftChars: 1,
      rightChars: 0,
      glossaryChars: 0,
    });
    assert.throws(() => assertEvaluationInputSize(stats), EvaluationInputTooLargeError);
  });

  it('allows input within limit', () => {
    const stats = buildEvaluationInputStats({
      sourceChars: 1000,
      leftChars: 1000,
      rightChars: 1000,
      glossaryChars: 100,
    });
    assert.equal(stats.tooLarge, false);
    assert.doesNotThrow(() => assertEvaluationInputSize(stats));
  });
});
