import { describe, expect, it } from 'vitest';
import { buildMarkTranslatedParagraphs } from './markTranslated.js';
import type { Paragraph } from '../../../storage/database.js';

describe('buildMarkTranslatedParagraphs', () => {
  it('copies original to translated and builds chunks in index order', () => {
    const paragraphs: Paragraph[] = [
      { id: 'p2', index: 1, originalText: 'Second', status: 'pending' },
      { id: 'p1', index: 0, originalText: 'First', status: 'pending' },
    ];
    const { updatedParagraphs, mergedText, chunks } = buildMarkTranslatedParagraphs(
      paragraphs,
      '2026-01-01T00:00:00.000Z'
    );
    const byId = Object.fromEntries(updatedParagraphs.map((p) => [p.id, p.translatedText]));
    expect(byId.p2).toBe('Second');
    expect(byId.p1).toBe('First');
    expect(updatedParagraphs[0].status).toBe('translated');
    expect(updatedParagraphs[0].editedBy).toBe('user');
    expect(chunks).toEqual(['First', 'Second']);
    expect(mergedText).toContain('First');
    expect(mergedText).toContain('Second');
  });
});
