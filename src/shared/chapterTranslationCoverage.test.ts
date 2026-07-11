import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
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

  it('resolveChapterStatusAfterTranslation: completed after full edit', () => {
    const paragraphs = [para('1', 'A', 'B'), para('2', 'C', 'D')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: true,
        editingPhase: 'after_edit',
      }),
      'completed'
    );
  });

  it('resolveChapterStatusAfterTranslation: partial when no translations at all', () => {
    const paragraphs = [para('1', 'A', ''), para('2', 'C', '')];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: false,
        editingPhase: 'none',
      }),
      'partial'
    );
  });

  it('hasValidParagraphTranslation rejects chunk error marker', () => {
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

  it('resolveChapterStatusAfterTranslation: partial when incomplete edit', () => {
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

  it('resolveChapterStatusAfterTranslation: partial when translation looks truncated', () => {
    const paragraphs = [para('1', 'x'.repeat(200), 'y'.repeat(40))];
    assert.equal(
      resolveChapterStatusAfterTranslation({
        paragraphs,
        runEditing: false,
        editingPhase: 'none',
      }),
      'partial'
    );
  });
});
