import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AI_REPLACE_MIN_ROLE, CRITIC_MIN_ROLE } from './featureGates.js';

describe('featureGates', () => {
  it('CRITIC_MIN_ROLE is author_plus', () => {
    assert.equal(CRITIC_MIN_ROLE, 'author_plus');
  });

  it('AI_REPLACE_MIN_ROLE is author_plus', () => {
    assert.equal(AI_REPLACE_MIN_ROLE, 'author_plus');
  });
});
