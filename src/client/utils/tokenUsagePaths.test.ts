import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isTokenUsageRelevant } from './tokenUsagePaths.js';

describe('tokenUsagePaths', () => {
  it('is true for projects grid and project pages except reading', () => {
    assert.equal(isTokenUsageRelevant('/projects'), true);
    assert.equal(isTokenUsageRelevant('/projects/p1'), true);
    assert.equal(isTokenUsageRelevant('/projects/p1/chapters/c1'), true);
  });

  it('is false for reading mode and catalog', () => {
    assert.equal(isTokenUsageRelevant('/projects/p1/reading'), false);
    assert.equal(isTokenUsageRelevant('/catalog'), false);
    assert.equal(isTokenUsageRelevant('/p/slug'), false);
  });
});
