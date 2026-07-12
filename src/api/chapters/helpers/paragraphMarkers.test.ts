import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../storage/database.js';
import {
  addParagraphMarkersToText,
  buildMarkedTextFromParagraphs,
  parseEditedTextByMarkers,
} from './paragraphMarkers.js';

function para(id: string, index: number, originalText: string, translatedText?: string): Paragraph {
  return { id, index, originalText, translatedText, status: 'pending' } as Paragraph;
}

describe('paragraphMarkers', () => {
  it('addParagraphMarkersToText matches paragraphs by originalText order', () => {
    const paragraphs = [para('p1', 0, 'Hello'), para('p2', 1, 'World')];
    const marked = addParagraphMarkersToText('Hello\n\nWorld', paragraphs);
    expect(marked).toContain('--para:p1--Hello');
    expect(marked).toContain('--para:p2--World');
  });

  it('addParagraphMarkersToText uses auto ids when no match', () => {
    const paragraphs = [para('p1', 0, 'Other')];
    const marked = addParagraphMarkersToText('Unknown text', paragraphs);
    expect(marked).toMatch(/--para:auto_0--Unknown text/);
  });

  it('buildMarkedTextFromParagraphs uses translated text when present', () => {
    const marked = buildMarkedTextFromParagraphs([
      para('p2', 1, 'World', 'Мир'),
      para('p1', 0, 'Hello', 'Привет'),
    ]);
    expect(marked.indexOf('--para:p1--')).toBeLessThan(marked.indexOf('--para:p2--'));
    expect(marked).toContain('--para:p1--Привет');
    expect(marked).toContain('--para:p2--Мир');
  });

  it('parseEditedTextByMarkers delegates to engine parser', () => {
    const parsed = parseEditedTextByMarkers('--para:p1--Text here');
    expect(parsed).toEqual([{ id: 'p1', text: 'Text here' }]);
  });
});
