/**
 * Resolve which paragraphs to translate (full / selected / empty-only).
 */

import type { Chapter, Paragraph } from '../../../storage/database.js';
import { mergeParagraphsToText } from '../../../storage/database.js';
import { hasValidParagraphTranslation } from './paragraphTranslation.js';
import { addParagraphMarkersToText, buildMarkedTextFromParagraphs } from './paragraphMarkers.js';

export type TranslationSkipReason = 'no_selected_paragraphs' | 'no_empty_paragraphs';

export interface TranslationSubsetPlan {
  paragraphsToTranslate: Paragraph[];
  chapterOriginalText: string;
  translateSubsetOnly: boolean;
  skipReason?: TranslationSkipReason;
  partialSync: boolean;
}

export function resolveTranslationSubsetPlan(
  chapter: Chapter,
  options: { paragraphIds?: string[]; translateOnlyEmpty?: boolean }
): TranslationSubsetPlan {
  const paragraphs = chapter.paragraphs || [];
  const { paragraphIds, translateOnlyEmpty } = options;

  if (paragraphIds?.length) {
    const idSet = new Set(paragraphIds);
    const selected = paragraphs.filter((p) => idSet.has(p.id));
    if (selected.length === 0) {
      return {
        paragraphsToTranslate: [],
        chapterOriginalText: '',
        translateSubsetOnly: true,
        skipReason: 'no_selected_paragraphs',
        partialSync: false,
      };
    }
    const textToTranslate = mergeParagraphsToText(selected, 'originalText');
    return {
      paragraphsToTranslate: selected,
      chapterOriginalText: addParagraphMarkersToText(textToTranslate, selected),
      translateSubsetOnly: true,
      partialSync: false,
    };
  }

  if (translateOnlyEmpty) {
    const emptyParagraphs = paragraphs.filter((p) => !hasValidParagraphTranslation(p));
    if (emptyParagraphs.length === 0) {
      return {
        paragraphsToTranslate: [],
        chapterOriginalText: '',
        translateSubsetOnly: false,
        skipReason: 'no_empty_paragraphs',
        partialSync: false,
      };
    }
    const textToTranslate = mergeParagraphsToText(emptyParagraphs, 'originalText');
    return {
      paragraphsToTranslate: emptyParagraphs,
      chapterOriginalText: addParagraphMarkersToText(textToTranslate, emptyParagraphs),
      translateSubsetOnly: false,
      partialSync: true,
    };
  }

  return {
    paragraphsToTranslate: paragraphs,
    chapterOriginalText: addParagraphMarkersToText(chapter.originalText, paragraphs),
    translateSubsetOnly: false,
    partialSync: false,
  };
}

export function resolveExistingTranslatedTextForPipeline(chapter: Chapter): string | undefined {
  if (chapter.paragraphs?.length) {
    return buildMarkedTextFromParagraphs(chapter.paragraphs);
  }
  return chapter.translatedText?.trim() || undefined;
}
