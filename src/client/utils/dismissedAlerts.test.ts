/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import {
  isAnnouncementDismissedLocally,
  mergeServerDismissals,
  saveAnnouncementDismissedLocally,
} from './dismissedAlerts.js';

describe('dismissedAlerts', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('tracks dismissed announcement versions locally', () => {
    assert.equal(isAnnouncementDismissedLocally('a1', 1), false);
    saveAnnouncementDismissedLocally('a1', 1);
    assert.equal(isAnnouncementDismissedLocally('a1', 1), true);
    assert.equal(isAnnouncementDismissedLocally('a1', 2), false);
  });

  it('mergeServerDismissals keeps highest content version', () => {
    saveAnnouncementDismissedLocally('a1', 1);
    mergeServerDismissals([{ announcementId: 'a1', contentVersion: 3 }]);
    assert.equal(isAnnouncementDismissedLocally('a1', 3), true);
  });
});
