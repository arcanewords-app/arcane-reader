/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { getConsent, setConsent } from './cookieConsent.js';

describe('cookieConsent', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when unset', () => {
    assert.equal(getConsent(), null);
  });

  it('round-trips accepted and rejected values', () => {
    setConsent('accepted');
    assert.equal(getConsent(), 'accepted');
    setConsent('rejected');
    assert.equal(getConsent(), 'rejected');
  });
});
