import type { ChapterListItem, Project, ProjectWithChapterList } from '../types';

export function getRawReadingParagraphFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('paragraph');
}

export function parseReadingParagraphFromUrl(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('paragraph');
  if (raw == null || raw === '') return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function hasReadingParagraphQueryInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = new URLSearchParams(window.location.search).get('paragraph');
  return raw != null && raw !== '';
}

/** Auth: explicit `?paragraph=` share link wins; otherwise API position when chapter matches. */
export function resolveReadingParagraphIndex(options: {
  isAuthenticated: boolean;
  urlHasParagraph: boolean;
  urlParagraphIndex?: number;
  apiChapterId?: string | null;
  currentChapterId?: string;
  apiParagraphIndex?: number;
}): number | undefined {
  const {
    isAuthenticated,
    urlHasParagraph,
    urlParagraphIndex,
    apiChapterId,
    currentChapterId,
    apiParagraphIndex,
  } = options;

  if (urlHasParagraph && urlParagraphIndex !== undefined && urlParagraphIndex > 0) {
    return urlParagraphIndex;
  }

  if (
    isAuthenticated &&
    apiChapterId &&
    currentChapterId === apiChapterId &&
    apiParagraphIndex !== undefined &&
    apiParagraphIndex > 0
  ) {
    return apiParagraphIndex;
  }

  return undefined;
}

export function buildReadingChapterUrl(params: {
  isPublicationMode: boolean;
  publicationPath?: string;
  publicationId?: string;
  projectId?: string;
  chapterId: string;
  paragraphIndex?: number;
}): string | null {
  const {
    isPublicationMode,
    publicationPath,
    publicationId,
    projectId,
    chapterId,
    paragraphIndex,
  } = params;

  let base: string | null = null;
  if (isPublicationMode) {
    const path = publicationPath ?? publicationId;
    if (!path) return null;
    base = `/p/${path}/chapters/${chapterId}/reading`;
  } else if (projectId) {
    base = `/projects/${projectId}/chapters/${chapterId}/reading`;
  }
  if (!base) return null;

  if (paragraphIndex === undefined || paragraphIndex <= 0) {
    return base;
  }

  const qs = new URLSearchParams();
  qs.set('paragraph', String(paragraphIndex));
  return `${base}?${qs.toString()}`;
}

/** First chapter available in author reading mode (matches ReadingMode filter logic). */
export function getFirstAuthorReadingChapterId(
  project: Project | ProjectWithChapterList
): string | undefined {
  const isOriginalReadingMode = project.settings?.originalReadingMode ?? false;
  const projectChapters = project.chapters as ChapterListItem[];
  let availableChapters: ChapterListItem[];
  if (isOriginalReadingMode) {
    availableChapters = [...projectChapters].sort((a, b) => a.number - b.number);
  } else {
    availableChapters = projectChapters
      .filter(
        (ch) =>
          ch.hasTranslation ||
          ch.status === 'completed' ||
          ch.status === 'draft' ||
          ch.status === 'partial'
      )
      .sort((a, b) => a.number - b.number);
  }
  return availableChapters[0]?.id;
}
