import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  isTranslationStatus,
  translationStatusFromMetadata,
  TRANSLATION_STATUSES,
} from './translation-status.js';

describe('translation-status', () => {
  it('validates known translation status values', () => {
    for (const status of TRANSLATION_STATUSES) {
      assert.equal(isTranslationStatus(status), true);
    }
    assert.equal(isTranslationStatus('unknown'), false);
    assert.equal(isTranslationStatus(null), false);
  });

  it('returns explicit translationStatus from metadata', () => {
    assert.equal(
      translationStatusFromMetadata({ translationStatus: 'in_progress' }),
      'in_progress'
    );
    assert.equal(translationStatusFromMetadata({ translationStatus: 'complete' }), 'complete');
    assert.equal(translationStatusFromMetadata({ translationStatus: 'abandoned' }), 'abandoned');
  });

  it('maps legacy isCompleteWork true to complete', () => {
    assert.equal(translationStatusFromMetadata({ isCompleteWork: true }), 'complete');
  });

  it('returns null for missing or empty metadata', () => {
    assert.equal(translationStatusFromMetadata(null), null);
    assert.equal(translationStatusFromMetadata(undefined), null);
    assert.equal(translationStatusFromMetadata({}), null);
    assert.equal(translationStatusFromMetadata({ isCompleteWork: false }), null);
  });
});
