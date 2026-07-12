import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  createMatchSnippet,
  escapeRegex,
  matchesWholeWord,
  paragraphMatchKey,
  textContainsQuery,
} from './projectSearch.js';

describe('projectSearch', () => {
  it('escapeRegex escapes regex metacharacters', () => {
    assert.equal(escapeRegex('a.b'), 'a\\.b');
  });

  it('matchesWholeWord matches Unicode word boundaries', () => {
    assert.equal(matchesWholeWord('magic spell', 'spell'), true);
    assert.equal(matchesWholeWord('magicspell', 'spell'), false);
  });

  it('textContainsQuery is case-insensitive by default', () => {
    assert.equal(textContainsQuery('Hello World', 'world'), true);
    assert.equal(textContainsQuery('Hello', 'xyz'), false);
  });

  it('createMatchSnippet centers around match', () => {
    const snippet = createMatchSnippet('prefix ' + 'x'.repeat(80) + ' MAGIC tail', 'MAGIC');
    assert.match(snippet, /MAGIC/);
    assert.match(snippet, /^…/);
  });

  it('paragraphMatchKey joins chapter and paragraph ids', () => {
    assert.equal(paragraphMatchKey('ch-1', 'p-1'), 'ch-1-p-1');
  });
});
