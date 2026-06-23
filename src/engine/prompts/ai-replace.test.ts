import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changeRatioTooHigh, levenshteinDistance, paragraphChangeRatio } from './ai-replace.js';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(levenshteinDistance('hello', 'hello'), 0);
  });

  it('counts single insertion', () => {
    assert.equal(levenshteinDistance('Аврор', 'Аврора'), 1);
  });
});

describe('changeRatioTooHigh', () => {
  it('returns false for identical strings', () => {
    assert.equal(changeRatioTooHigh('same', 'same'), false);
  });

  it('returns false for single insertion in middle of long text', () => {
    const before = 'осколок души Аврор уже давно покинул этот мир и больше не возвращался.';
    const after = 'осколок души Аврора уже давно покинул этот мир и больше не возвращался.';
    assert.equal(changeRatioTooHigh(before, after), false);
    assert.ok(paragraphChangeRatio(before, after) < 0.05);
  });

  it('returns false for declension fix Аврор -> Аврора in sentence', () => {
    const before = 'Она встретила Аврор у ворот замка.';
    const after = 'Она встретила Аврора у ворот замка.';
    assert.equal(changeRatioTooHigh(before, after), false);
  });

  it('returns true for full rewrite of same length', () => {
    const before = 'abcdefghijklmnopqrstuvwxyz';
    const after = 'zyxwvutsrqponmlkjihgfedcba';
    assert.equal(changeRatioTooHigh(before, after), true);
  });
});
