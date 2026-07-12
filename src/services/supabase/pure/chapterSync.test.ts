import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { autoSyncChunksToParagraphs } from './chapterSync.js';

function makeParagraph(index: number, original: string, translated?: string) {
  return {
    id: `p-${index}`,
    index,
    originalText: original,
    translatedText: translated,
    status: translated ? ('translated' as const) : ('pending' as const),
  };
}

describe('autoSyncChunksToParagraphs', () => {
  it('skips separator paragraphs', () => {
    const result = autoSyncChunksToParagraphs(
      [makeParagraph(0, 'Hello'), makeParagraph(1, '***'), makeParagraph(2, 'World')],
      ['Привет', 'Мир']
    );
    assert.equal(result[0].translatedText, 'Привет');
    assert.equal(result[1].translatedText, undefined);
    assert.equal(result[2].translatedText, 'Мир');
  });

  it('preserves existing valid translations', () => {
    const result = autoSyncChunksToParagraphs([makeParagraph(0, 'Hi', 'Already')], ['New']);
    assert.equal(result[0].translatedText, 'Already');
  });
});
