import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  ACCOUNT_TIER_COLUMNS,
  canRequestTierUpgrade,
  formatProjectLimitForTier,
  getDailyTokenLimitForTier,
  getMaxProjectsForTier,
  roleToAccountTier,
  TIER_FEATURE_MATRIX,
  TIER_MODEL_ACCESS_MATRIX,
} from './accountTiers.js';

describe('accountTiers', () => {
  it('ACCOUNT_TIER_COLUMNS lists public comparison tiers', () => {
    assert.deepEqual(ACCOUNT_TIER_COLUMNS, ['user', 'author', 'author_plus', 'super_author']);
  });

  it('getDailyTokenLimitForTier returns role limits', () => {
    assert.equal(typeof getDailyTokenLimitForTier('user'), 'number');
    assert.equal(getDailyTokenLimitForTier('super_author'), 200_000);
  });

  it('getMaxProjectsForTier and formatProjectLimitForTier', () => {
    assert.equal(getMaxProjectsForTier('user'), 0);
    assert.equal(formatProjectLimitForTier('user'), '—');
    assert.equal(formatProjectLimitForTier('super_author'), '100');
  });

  it('roleToAccountTier excludes guest and admin', () => {
    assert.equal(roleToAccountTier('guest'), null);
    assert.equal(roleToAccountTier('admin'), null);
    assert.equal(roleToAccountTier('author'), 'author');
  });

  it('canRequestTierUpgrade is false for super_author and admin', () => {
    assert.equal(canRequestTierUpgrade('user'), true);
    assert.equal(canRequestTierUpgrade('super_author'), false);
    assert.equal(canRequestTierUpgrade('admin'), false);
  });

  it('TIER_FEATURE_MATRIX and TIER_MODEL_ACCESS_MATRIX have all tier columns', () => {
    for (const tier of ACCOUNT_TIER_COLUMNS) {
      assert.equal(TIER_FEATURE_MATRIX.catalogReading[tier], 'yes');
      assert.ok(TIER_MODEL_ACCESS_MATRIX[tier]);
    }
  });
});
