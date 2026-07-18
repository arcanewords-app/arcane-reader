/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
  clearConsent,
  CONSENT_POLICY_VERSION,
  getConsent,
  parseConsentRecord,
  REJECT_REPROMPT_MS,
  setConsent,
} from './cookieConsent.js';

const STORAGE_KEY = 'arcane:cookie-consent';

describe('cookieConsent', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when unset', () => {
    assert.equal(getConsent(), null);
  });

  it('round-trips accepted and rejected values as JSON records', () => {
    setConsent('accepted');
    assert.equal(getConsent(), 'accepted');
    const raw = localStorage.getItem(STORAGE_KEY);
    assert.ok(raw?.startsWith('{'));
    setConsent('rejected');
    assert.equal(getConsent(), 'rejected');
  });

  it('migrates legacy plain-string values', () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    assert.equal(getConsent(), 'accepted');
    const migrated = localStorage.getItem(STORAGE_KEY);
    assert.ok(migrated?.includes('"policyVersion"'));
  });

  it('parseConsentRecord handles legacy strings', () => {
    const record = parseConsentRecord('rejected');
    assert.equal(record?.status, 'rejected');
    assert.equal(record?.policyVersion, CONSENT_POLICY_VERSION);
  });

  it('returns null when reject consent expired after 30 days', () => {
    const expiredAt = new Date(Date.now() - REJECT_REPROMPT_MS - 1000).toISOString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        status: 'rejected',
        at: expiredAt,
        policyVersion: CONSENT_POLICY_VERSION,
      })
    );
    assert.equal(getConsent(), null);
  });

  it('keeps reject consent within 30 days', () => {
    const recentAt = new Date(Date.now() - REJECT_REPROMPT_MS + 60_000).toISOString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        status: 'rejected',
        at: recentAt,
        policyVersion: CONSENT_POLICY_VERSION,
      })
    );
    assert.equal(getConsent(), 'rejected');
  });

  it('clearConsent removes stored value', () => {
    setConsent('accepted');
    clearConsent();
    assert.equal(getConsent(), null);
  });
});
