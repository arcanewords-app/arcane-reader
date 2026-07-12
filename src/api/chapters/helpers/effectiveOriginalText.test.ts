import { describe, expect, it } from 'vitest';
import {
  resolveEffectiveOriginalText,
  chapterWithEffectiveOriginalText,
} from './effectiveOriginalText.js';
import type { Chapter } from '../../../storage/database.js';

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'T',
    originalText: '',
    status: 'pending',
    paragraphs: [],
    ...overrides,
  } as Chapter;
}

describe('effectiveOriginalText', () => {
  it('prefers chapter.originalText when non-empty', () => {
    expect(
      resolveEffectiveOriginalText({
        originalText: '  hello  ',
        paragraphs: [{ id: 'p1', index: 0, originalText: 'para', status: 'pending' }],
      })
    ).toBe('hello');
  });

  it('falls back to merged paragraphs', () => {
    expect(
      resolveEffectiveOriginalText({
        paragraphs: [
          { id: 'p1', index: 0, originalText: 'Line one', status: 'pending' },
          { id: 'p2', index: 1, originalText: 'Line two', status: 'pending' },
        ],
      })
    ).toBe('Line one\n\nLine two');
  });

  it('chapterWithEffectiveOriginalText returns null when no text', () => {
    expect(chapterWithEffectiveOriginalText(chapter())).toBeNull();
  });

  it('chapterWithEffectiveOriginalText sets originalText from paragraphs', () => {
    const result = chapterWithEffectiveOriginalText(
      chapter({
        paragraphs: [{ id: 'p1', index: 0, originalText: 'Src', status: 'pending' }],
      })
    );
    expect(result?.originalText).toBe('Src');
  });
});
