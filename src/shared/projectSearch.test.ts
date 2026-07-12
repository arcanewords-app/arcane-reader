import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { ProjectSearchMatchBase } from './projectSearch.js';
import {
  createMatchSnippet,
  createSnippetHtml,
  dedupeParagraphMatches,
  escapeRegex,
  extractTextBlockType,
  filterProjectMatches,
  matchesWholeWord,
  paragraphMatchKey,
  paragraphMatchesSearch,
  replaceInText,
  textContainsQuery,
} from './projectSearch.js';

function makeMatch(overrides: Partial<ProjectSearchMatchBase> = {}): ProjectSearchMatchBase {
  return {
    chapterId: 'ch-1',
    chapterNumber: 3,
    chapterTitle: 'Chapter 3',
    paragraphId: 'p-1',
    paragraphIndex: 0,
    field: 'translated',
    snippet: 'hero saves the day',
    fullText: '{{block:dialogue}}hero saves the day{{/block:dialogue}}',
    ...overrides,
  };
}

describe('projectSearch', () => {
  describe('escapeRegex', () => {
    it('escapes regex metacharacters', () => {
      assert.equal(escapeRegex('a.b'), 'a\\.b');
      assert.equal(escapeRegex('(test)?[x]+'), '\\(test\\)\\?\\[x\\]\\+');
    });
  });

  describe('matchesWholeWord', () => {
    it('matches Unicode word boundaries', () => {
      assert.equal(matchesWholeWord('magic spell', 'spell'), true);
      assert.equal(matchesWholeWord('magicspell', 'spell'), false);
    });

    it('treats underscore as word character', () => {
      assert.equal(matchesWholeWord('my_spell word', 'spell'), false);
      assert.equal(matchesWholeWord('find spell here', 'spell'), true);
    });

    it('returns false for empty or whitespace-only query', () => {
      assert.equal(matchesWholeWord('hello', ''), false);
      assert.equal(matchesWholeWord('hello', '   '), false);
    });

    it('supports case-sensitive matching', () => {
      assert.equal(matchesWholeWord('Magic spell', 'Magic', true), true);
      assert.equal(matchesWholeWord('Magic spell', 'magic', true), false);
    });

    it('matches Cyrillic whole words', () => {
      assert.equal(matchesWholeWord('герой спасает мир', 'герой'), true);
      assert.equal(matchesWholeWord('супергерой', 'герой'), false);
    });
  });

  describe('textContainsQuery', () => {
    it('is case-insensitive by default', () => {
      assert.equal(textContainsQuery('Hello World', 'world'), true);
      assert.equal(textContainsQuery('Hello', 'xyz'), false);
    });

    it('returns false for empty query', () => {
      assert.equal(textContainsQuery('Hello', ''), false);
      assert.equal(textContainsQuery('Hello', '  '), false);
    });

    it('supports case-sensitive substring search', () => {
      assert.equal(textContainsQuery('Hello World', 'world', true), false);
      assert.equal(textContainsQuery('Hello World', 'World', true), true);
      assert.equal(textContainsQuery('Hello World', 'world', false), true);
    });
  });

  describe('createMatchSnippet', () => {
    it('centers around match with leading ellipsis', () => {
      const snippet = createMatchSnippet('prefix ' + 'x'.repeat(80) + ' MAGIC tail', 'MAGIC');
      assert.match(snippet, /MAGIC/);
      assert.match(snippet, /^…/);
    });

    it('adds trailing ellipsis when match is near end', () => {
      const text = 'start ' + 'y'.repeat(80) + ' TARGET' + 'z'.repeat(80);
      const snippet = createMatchSnippet(text, 'TARGET');
      assert.match(snippet, /TARGET/);
      assert.match(snippet, /…$/);
    });

    it('returns prefix slice when query is absent', () => {
      const text = 'a'.repeat(200);
      const snippet = createMatchSnippet(text, 'missing');
      assert.equal(snippet, text.slice(0, 120));
    });

    it('respects case-sensitive needle position', () => {
      const snippet = createMatchSnippet('Alpha beta', 'Alpha', true);
      assert.match(snippet, /Alpha/);
    });
  });

  describe('createSnippetHtml', () => {
    it('escapes HTML and wraps match in mark', () => {
      const html = createSnippetHtml('<script>alert(1)</script> MAGIC', 'MAGIC', false);
      assert.match(html, /&lt;script&gt;/);
      assert.match(html, /<mark>MAGIC<\/mark>/);
    });

    it('is case-insensitive when caseSensitive is false', () => {
      const html = createSnippetHtml('find Magic here', 'magic', false);
      assert.match(html, /<mark>Magic<\/mark>/);
    });
  });

  describe('extractTextBlockType', () => {
    it('parses block marker type', () => {
      assert.equal(extractTextBlockType('{{block:dialogue}}text{{/block:dialogue}}'), 'dialogue');
    });

    it('returns null when marker is absent', () => {
      assert.equal(extractTextBlockType('plain text'), null);
    });
  });

  describe('dedupeParagraphMatches', () => {
    it('keeps first match per paragraph', () => {
      const matches = [
        makeMatch({ paragraphId: 'p-1', snippet: 'first' }),
        makeMatch({ paragraphId: 'p-1', snippet: 'second' }),
        makeMatch({ paragraphId: 'p-2', snippet: 'other' }),
      ];
      const deduped = dedupeParagraphMatches(matches);
      assert.equal(deduped.length, 2);
      assert.equal(deduped[0]?.snippet, 'first');
    });
  });

  describe('filterProjectMatches', () => {
    it('filters by chapter number range', () => {
      const matches = [
        makeMatch({ chapterNumber: 1 }),
        makeMatch({ chapterNumber: 5, paragraphId: 'p-2' }),
      ];
      const filtered = filterProjectMatches(matches, { chapterFrom: 2, chapterTo: 10 });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0]?.chapterNumber, 5);
    });

    it('filters by secondary filterQuery in snippet or fullText', () => {
      const matches = [
        makeMatch({ snippet: 'hero wins', fullText: 'hero wins' }),
        makeMatch({ paragraphId: 'p-2', snippet: 'villain escapes', fullText: 'villain escapes' }),
      ];
      const filtered = filterProjectMatches(matches, { filterQuery: 'villain' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0]?.snippet, 'villain escapes');
    });

    it('filters by text block type', () => {
      const matches = [
        makeMatch({ fullText: '{{block:dialogue}}hi{{/block:dialogue}}' }),
        makeMatch({
          paragraphId: 'p-2',
          fullText: '{{block:narration}}hi{{/block:narration}}',
        }),
      ];
      const filtered = filterProjectMatches(matches, { textBlockType: 'narration' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0]?.paragraphId, 'p-2');
    });

    it('ignores blank filterQuery', () => {
      const matches = [makeMatch(), makeMatch({ paragraphId: 'p-2' })];
      assert.equal(filterProjectMatches(matches, { filterQuery: '   ' }).length, 2);
    });
  });

  describe('replaceInText', () => {
    it('replaces first occurrence when replaceAll is false', () => {
      const result = replaceInText('foo bar foo', 'foo', 'baz', false, false);
      assert.equal(result, 'baz bar foo');
    });

    it('replaces all occurrences when replaceAll is true', () => {
      const result = replaceInText('foo bar foo', 'foo', 'baz', true, false);
      assert.equal(result, 'baz bar baz');
    });

    it('returns original text when find is empty', () => {
      assert.equal(replaceInText('unchanged', '  ', 'x', true, false), 'unchanged');
    });

    it('supports case-insensitive replace', () => {
      const result = replaceInText('Magic magic', 'magic', 'spell', true, false);
      assert.equal(result, 'spell spell');
    });
  });

  describe('paragraphMatchesSearch', () => {
    it('uses substring search by default', () => {
      assert.equal(paragraphMatchesSearch('magicspell', 'spell'), true);
    });

    it('uses whole-word search when wholeWord is true', () => {
      assert.equal(paragraphMatchesSearch('magicspell', 'spell', { wholeWord: true }), false);
      assert.equal(paragraphMatchesSearch('magic spell', 'spell', { wholeWord: true }), true);
    });
  });

  describe('paragraphMatchKey', () => {
    it('joins chapter and paragraph ids', () => {
      assert.equal(paragraphMatchKey('ch-1', 'p-1'), 'ch-1-p-1');
    });
  });
});
