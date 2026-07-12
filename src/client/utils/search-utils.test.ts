import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { searchInParagraphs } from './search-utils.js';

describe('search-utils', () => {
  it('searchInParagraphs finds literal matches in translated field', () => {
    const matches = searchInParagraphs(
      [
        { id: 'p1', index: 0, originalText: 'Hello', translatedText: 'Привет мир' },
        { id: 'p2', index: 1, originalText: 'World', translatedText: 'Мир' },
      ],
      'мир'
    );
    assert.equal(matches.length, 2);
    assert.equal(matches[0].field, 'translated');
  });

  it('returns empty list for blank query', () => {
    assert.deepEqual(searchInParagraphs([], '  '), []);
  });
});
