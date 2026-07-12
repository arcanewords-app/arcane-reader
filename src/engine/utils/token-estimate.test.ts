import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { countCjkCharacters, estimateTokensHeuristic, isCjkCharCode } from './token-estimate.js';

describe('token-estimate', () => {
  it('isCjkCharCode detects Han characters', () => {
    assert.equal(isCjkCharCode('中'.charCodeAt(0)), true);
    assert.equal(isCjkCharCode('A'.charCodeAt(0)), false);
  });

  it('estimateTokensHeuristic weights CJK higher than Latin', () => {
    const latin = estimateTokensHeuristic('Hello world');
    const cjk = estimateTokensHeuristic('你好世界');
    assert.ok(cjk > latin);
  });

  it('countCjkCharacters counts only CJK code points', () => {
    assert.equal(countCjkCharacters('Hi 你好'), 2);
  });
});
