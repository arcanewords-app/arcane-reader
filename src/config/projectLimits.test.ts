import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  createProjectLimitError,
  getProjectLimitForRole,
  isProjectLimitError,
  isUnlimitedProjectLimit,
} from './projectLimits.js';

describe('projectLimits', () => {
  it('returns role-specific limits', () => {
    assert.equal(getProjectLimitForRole('author'), 10);
    assert.equal(getProjectLimitForRole('author_plus'), 30);
    assert.equal(getProjectLimitForRole('super_author'), 100);
    assert.equal(getProjectLimitForRole('user'), 0);
  });

  it('treats admin as unlimited', () => {
    assert.equal(getProjectLimitForRole('admin'), -1);
    assert.equal(isUnlimitedProjectLimit(-1), true);
    assert.equal(isUnlimitedProjectLimit(10), false);
  });

  it('creates and detects PROJECT_LIMIT errors', () => {
    const err = createProjectLimitError(10, 10);
    assert.equal(err.code, 'PROJECT_LIMIT');
    assert.equal(err.limit, 10);
    assert.equal(err.current, 10);
    assert.equal(isProjectLimitError(err), true);
    assert.equal(isProjectLimitError(new Error('other')), false);
  });
});
