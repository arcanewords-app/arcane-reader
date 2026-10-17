import type { Chapter, ChapterListItem, GlossaryEntry, Paragraph } from '../../storage/database.js';

/** Active edition when the request asks for a language other than the project primary. */
export function resolveRequestedEdition(
  requested: string | undefined | null,
  primaryLanguage: string
): string | undefined {
  const lang = requested?.trim();
  if (!lang || lang === primaryLanguage) return undefined;
  return lang;
}

export function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const message = error.message ?? '';
  return /does not exist|schema cache/i.test(message);
}

/** Target-language form stored in glossary_translations. */
export interface GlossaryTranslationForm {
  translated: string;
  declensions?: GlossaryEntry['declensions'];
}

/**
 * Keep originals and mentions. Missing forms stay empty so the primary translation
 * is not shown as the second language.
 */
export function blankGlossaryTranslations(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    translated: '',
    declensions: undefined,
  }));
}

export function overlayGlossaryTranslations(
  entries: GlossaryEntry[],
  forms: ReadonlyMap<string, GlossaryTranslationForm>
): GlossaryEntry[] {
  return entries.map((entry) => {
    const form = forms.get(entry.id);
    if (!form) {
      return { ...entry, translated: '', declensions: undefined };
    }
    return {
      ...entry,
      translated: form.translated,
      declensions: form.declensions,
    };
  });
}

export interface ChapterEditionState {
  status: Chapter['status'];
  translatedTitle?: string;
  hasTranslation: boolean;
}

const TRANSLATED_STATUSES = new Set(['draft', 'partial', 'completed']);

export function overlayChapterListItem<T extends ChapterListItem>(
  item: T,
  edition: ChapterEditionState | undefined
): T {
  if (!edition) {
    return {
      ...item,
      status: 'pending',
      translatedTitle: undefined,
      hasTranslation: false,
    };
  }
  return {
    ...item,
    status: edition.status,
    translatedTitle: edition.translatedTitle,
    hasTranslation: edition.hasTranslation || TRANSLATED_STATUSES.has(edition.status),
  };
}

export function overlayChapterParagraphs(
  chapter: Chapter,
  edition: {
    status: Chapter['status'];
    translatedTitle?: string;
    paragraphs: Map<string, Pick<Paragraph, 'translatedText' | 'status'>>;
  } | null
): Chapter {
  const paragraphs = chapter.paragraphs.map((paragraph) => {
    const translated = edition?.paragraphs.get(paragraph.id);
    if (!translated) {
      return { ...paragraph, translatedText: undefined, status: 'pending' as const };
    }
    return {
      ...paragraph,
      translatedText: translated.translatedText,
      status: translated.status ?? 'pending',
    };
  });
  return {
    ...chapter,
    status: edition?.status ?? 'pending',
    translatedTitle: edition?.translatedTitle,
    translatedText: undefined,
    paragraphs,
  };
}
