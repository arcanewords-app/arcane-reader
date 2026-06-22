import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTranslationCoverage,
  hasValidParagraphTranslation,
  isContentParagraph,
  isSeparatorParagraph,
  resolveChapterStatusAfterTranslation,
} from './chapterTranslationCoverage.js';

const para = (
  id: string,
  originalText: string,
  translatedText?: string
): { id: string; originalText: string; translatedText?: string } => ({
  id,
  originalText,
  translatedText,
});

describe('chapterTranslationCoverage', () => {
  it('treats separator paragraphs as non-content', () => {
    const p = para('s1', '***');
    assert.equal(isSeparatorParagraph(p), true);
    assert.equal(isContentParagraph(p), false);
  });

  it('counts valid translations among content paragraphs', () => {
    const paragraphs = [
      para('1', 'Hello', 'Привет'),
      para('2', 'World', ''),
      para('3', '---'),
      para('4', 'Tail', 'Хвост'),
    ];
    const coverage = getTranslationCoverage(paragraphs);
    assert.equal(coverage.contentTotal, 3);
    assert.equal(coverage.translatedCount, 2);
    assert.equal(coverage.isComplete, false);
    assert.deepEqual(coverage.missingParagraphIds, ['2']);
  });

  it('rejects chunk error translations', () => {
    const p = para('1', 'Hi', '[ERROR] chunk failed');
    assert.equal(hasValidParagraphTranslation(p), false);
  });

  it('resolveChapterStatusAfterTranslation: partial when incomplete', () => {
    const paragraphs = [para('1', 'A', 'B'), para('2', 'C', '')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: false,
        editingPhase: 'none',
      }),
      'partial'
    );
  });

  it('resolveChapterStatusAfterTranslation: draft after full translate when editing pending', () => {
    const paragraphs = [para('1', 'A', 'B'), para('2', 'C', 'D')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: true,
        editingPhase: 'after_translate',
      }),
      'draft'
    );
  });

  it('resolveChapterStatusAfterTranslation: completed after full translate-only', () => {
    const paragraphs = [para('1', 'A', 'B')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: false,
        editingPhase: 'none',
      }),
      'completed'
    );
  });

  it('resolveChapterStatusAfterTranslation: partial after incomplete edit', () => {
    const paragraphs = [para('1', 'A', 'B'), para('2', 'C', '')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: true,
        editingPhase: 'after_edit',
      }),
      'partial'
    );
  });
});
