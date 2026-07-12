import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'vitest';
import {
  buildCriticFingerprintPayload,
  computeCriticContentFingerprintFromTexts,
  hashCriticFingerprintPayload,
} from './critic-fingerprint.js';

describe('critic-fingerprint', () => {
  it('joins translated texts with unit separator', () => {
    assert.equal(buildCriticFingerprintPayload(['a', 'b']), `a\x1fb`);
    assert.equal(buildCriticFingerprintPayload([]), '');
  });

  it('hashCriticFingerprintPayload returns sha256 hex', () => {
    const payload = 'test-payload';
    const expected = createHash('sha256').update(payload).digest('hex');
    assert.equal(hashCriticFingerprintPayload(payload), expected);
  });

  it('computeCriticContentFingerprintFromTexts is stable for same input', () => {
    const texts = ['Привет', 'Мир'];
    const a = computeCriticContentFingerprintFromTexts(texts);
    const b = computeCriticContentFingerprintFromTexts(texts);
    assert.equal(a, b);
    assert.notEqual(a, computeCriticContentFingerprintFromTexts(['other']));
  });
});
