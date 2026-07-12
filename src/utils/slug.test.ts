import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { titleToSlug } from './slug.js';

describe('titleToSlug', () => {
  it('transliterates cyrillic and lowercases', () => {
    assert.equal(titleToSlug('Зенит Колдовства'), 'zenit-koldovstva');
  });

  it('strips special characters and collapses hyphens', () => {
    assert.equal(titleToSlug('Hello, World! 2026'), 'hello-world-2026');
  });

  it('returns publication fallback for empty slug', () => {
    assert.equal(titleToSlug('!!!'), 'publication');
  });

  it('truncates to 80 characters', () => {
    const longTitle = 'a'.repeat(120);
    assert.equal(titleToSlug(longTitle).length, 80);
  });
});
