import { describe, expect, it } from 'vitest';
import type { Chapter, Paragraph } from '../../../storage/database.js';
import {
  resolveExistingTranslatedTextForPipeline,
  resolveTranslationSubsetPlan,
} from './translationSubset.js';

function para(id: string, index: number, originalText: string, translatedText?: string): Paragraph {
  return {
    id,
    index,
    originalText,
    translatedText,
    status: translatedText ? 'translated' : 'pending',
  } as Paragraph;
}

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    number: 1,
    title: 'Chapter',
    originalText: 'Hello\n\nWorld',
    paragraphs: [para('p1', 0, 'Hello'), para('p2', 1, 'World')],
    ...overrides,
  } as Chapter;
}

describe('translationSubset', () => {
  it('resolveTranslationSubsetPlan full chapter marks all paragraphs', () => {
    const plan = resolveTranslationSubsetPlan(chapter(), {});
    expect(plan.skipReason).toBeUndefined();
    expect(plan.paragraphsToTranslate).toHaveLength(2);
    expect(plan.chapterOriginalText).toContain('--para:p1--');
    expect(plan.translateSubsetOnly).toBe(false);
  });

  it('resolveTranslationSubsetPlan selected ids filters paragraphs', () => {
    const plan = resolveTranslationSubsetPlan(chapter(), { paragraphIds: ['p2'] });
    expect(plan.translateSubsetOnly).toBe(true);
    expect(plan.paragraphsToTranslate).toHaveLength(1);
    expect(plan.paragraphsToTranslate[0]?.id).toBe('p2');
  });

  it('resolveTranslationSubsetPlan returns skip when selected ids missing', () => {
    const plan = resolveTranslationSubsetPlan(chapter(), { paragraphIds: ['missing'] });
    expect(plan.skipReason).toBe('no_selected_paragraphs');
    expect(plan.paragraphsToTranslate).toHaveLength(0);
  });

  it('resolveTranslationSubsetPlan empty-only skips when all translated', () => {
    const ch = chapter({
      paragraphs: [para('p1', 0, 'Hello', 'Привет'), para('p2', 1, 'World', 'Мир')],
    });
    const plan = resolveTranslationSubsetPlan(ch, { translateOnlyEmpty: true });
    expect(plan.skipReason).toBe('no_empty_paragraphs');
  });

  it('resolveTranslationSubsetPlan empty-only selects untranslated paragraphs', () => {
    const ch = chapter({
      paragraphs: [para('p1', 0, 'Hello', 'Привет'), para('p2', 1, 'World')],
    });
    const plan = resolveTranslationSubsetPlan(ch, { translateOnlyEmpty: true });
    expect(plan.paragraphsToTranslate).toHaveLength(1);
    expect(plan.partialSync).toBe(true);
  });

  it('resolveExistingTranslatedTextForPipeline prefers paragraph markers', () => {
    const text = resolveExistingTranslatedTextForPipeline(
      chapter({ paragraphs: [para('p1', 0, 'Hello', 'Привет')] })
    );
    expect(text).toContain('--para:p1--Привет');
  });
});
