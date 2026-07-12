import { describe, expect, it } from 'vitest';
import { isSeparatorTextChunk, splitTranslatedTextToChunks } from './translatedTextChunks.js';

describe('translatedTextChunks', () => {
  it('isSeparatorTextChunk detects separator-only chunks', () => {
    expect(isSeparatorTextChunk('***')).toBe(true);
    expect(isSeparatorTextChunk('---')).toBe(true);
    expect(isSeparatorTextChunk('Hello')).toBe(false);
  });

  it('splitTranslatedTextToChunks filters separators', () => {
    expect(splitTranslatedTextToChunks('Line one\n\n***\n\nLine two')).toEqual([
      'Line one',
      'Line two',
    ]);
  });
});
