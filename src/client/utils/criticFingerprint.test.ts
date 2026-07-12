import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { computeCriticContentFingerprint } from './criticFingerprint.js';
import { computeCriticContentFingerprintFromTexts } from '../../shared/critic-fingerprint.js';

describe('criticFingerprint client', () => {
  it('matches shared fingerprint for same paragraph texts', async () => {
    const paragraphs = [
      { id: 'p2', index: 2, originalText: 'B', translatedText: 'Б' },
      { id: 'p1', index: 1, originalText: 'A', translatedText: 'А' },
    ];
    const clientHash = await computeCriticContentFingerprint(paragraphs);
    const sharedHash = computeCriticContentFingerprintFromTexts(['А', 'Б']);
    assert.equal(clientHash, sharedHash);
  });
});
